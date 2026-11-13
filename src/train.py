"""
Model Training & Logging Script
===============================

This is the MAIN script that:
  1. Loads configuration
  2. Generates/trains a sample model
  3. Logs EVERYTHING to MLflow (params, metrics, model, artifacts)
  4. Registers the model in the Model Registry
  5. Transitions it to the target stage (Staging/Production)

KEY CONCEPTS TO LEARN:
  - mlflow.start_run() — creates a tracking run
  - mlflow.log_params() — logs hyperparameters
  - mlflow.log_metrics() — logs evaluation metrics
  - mlflow.sklearn.log_model() / mlflow.pyfunc.log_model() — logs the model
  - mlflow.register_model() — puts model in the registry
  - client.transition_model_version_stage() — moves between Staging/Production

USAGE:
  python src/train.py                          # Use defaults
  python src/train.py --framework sklearn       # Force sklearn
  python src/train.py --framework xgboost       # Force xgboost
  python src/train.py --framework pyfunc         # Use custom pyfunc wrapper
"""

import argparse
import json
import os
import tempfile
import yaml
import logging

import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
import mlflow.xgboost
from mlflow.tracking import MlflowClient
from mlflow.models import infer_signature

from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
import joblib

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def load_config(config_path="config/model_config.yaml"):
    """Load YAML configuration file."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def get_data():
    """
    Load a sample dataset (Iris) for demonstration.

    In production, you'd replace this with:
      - Reading from S3/GCS/Azure
      - Querying a database
      - Loading from a feature store
    """
    data = load_iris()
    X = pd.DataFrame(data.data, columns=data.feature_names)
    y = pd.Series(data.target)

    label_map = {i: name for i, name in enumerate(data.target_names)}

    logger.info(
        "Loaded dataset: %d samples, %d features, %d classes",
        len(X),
        X.shape[1],
        len(label_map),
    )
    return X, y, label_map


def train_sklearn(X_train, y_train, hyperparams):
    """Train a scikit-learn RandomForest classifier."""
    model = RandomForestClassifier(
        n_estimators=hyperparams.get("n_estimators", 100),
        max_depth=hyperparams.get("max_depth", 5),
        random_state=hyperparams.get("random_state", 42),
    )
    model.fit(X_train, y_train)
    return model


def train_xgboost(X_train, y_train, hyperparams):
    """Train an XGBoost classifier."""
    from xgboost import XGBClassifier

    model = XGBClassifier(
        n_estimators=hyperparams.get("n_estimators", 100),
        learning_rate=hyperparams.get("learning_rate", 0.1),
        max_depth=hyperparams.get("max_depth", 5),
        random_state=hyperparams.get("random_state", 42),
        use_label_encoder=False,
        eval_metric="mlogloss",
    )
    model.fit(X_train, y_train)
    return model


def evaluate(model, X_test, y_test):
    """Compute standard classification metrics."""
    y_pred = model.predict(X_test)
    return {
        "accuracy": accuracy_score(y_test, y_pred),
        "f1_score": f1_score(y_test, y_pred, average="weighted"),
        "precision": precision_score(y_test, y_pred, average="weighted"),
        "recall": recall_score(y_test, y_pred, average="weighted"),
    }


def log_and_register_sklearn(
    model,
    X_test,
    y_test,
    scaler,
    label_map,
    config,
    tracking_uri,
    experiment_name,
    model_name,
):
    """Log an sklearn model using the native MLflow flavor."""
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment(experiment_name)

    with mlflow.start_run(run_name=f"{model_name}_sklearn") as run:
        # --- Log hyperparameters ---
        hyperparams = config["training"]["hyperparams"]["sklearn"]
        mlflow.log_params(hyperparams)

        # --- Log metrics ---
        metrics = evaluate(model, X_test, y_test)
        mlflow.log_metrics(metrics)

        # --- Infer model signature ---
        # The signature tells MLflow what input/output schema to expect.
        # This is critical for serving — it validates requests.
        signature = infer_signature(X_test, model.predict(X_test))

        # --- Log the model using the sklearn flavor ---
        mlflow.sklearn.log_model(
            sk_model=model,
            artifact_path="model",
            signature=signature,
            input_example=X_test[:3],  # Example input for docs
        )

        # --- Log artifacts (scaler + label map) ---
        with tempfile.TemporaryDirectory() as tmpdir:
            scaler_path = os.path.join(tmpdir, "preprocessing.pkl")
            label_map_path = os.path.join(tmpdir, "label_map.json")

            joblib.dump(scaler, scaler_path)
            with open(label_map_path, "w") as f:
                json.dump(label_map, f)

            mlflow.log_artifact(scaler_path, "preprocessing")
            mlflow.log_artifact(label_map_path, "label_mapping")

        # --- Register model ---
        model_uri = f"runs:/{run.info.run_id}/model"
        registered = mlflow.register_model(
            model_uri=model_uri,
            name=model_name,
        )

        # --- Transition to target stage ---
        client = MlflowClient(tracking_uri)
        target_stage = config["serving"]["stage"]
        client.transition_model_version_stage(
            name=model_name,
            version=registered.version,
            stage=target_stage,
        )

        logger.info(
            "Registered model '%s' v%s → %s",
            model_name,
            registered.version,
            target_stage,
        )
        return run.info.run_id, registered.version


def log_and_register_pyfunc(
    model,
    scaler,
    X_test,
    y_test_split,
    label_map,
    config,
    tracking_uri,
    experiment_name,
    model_name,
):
    """
    Log a model using the pyfunc (Python Function) flavor.

    This is the GENERIC approach — it wraps any model in a standardized
    predict() interface. The CustomInferenceModel class handles:
      - loading preprocessing artifacts
      - running inference
      - post-processing predictions
    """
    from src.custom_model import CustomInferenceModel

    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment(experiment_name)

    with mlflow.start_run(run_name=f"{model_name}_pyfunc") as run:
        # --- Log hyperparameters ---
        hyperparams = config["training"]["hyperparams"]["sklearn"]
        mlflow.log_params(hyperparams)

        # --- Log metrics ---
        metrics = evaluate(model, X_test, y_test_split)
        mlflow.log_metrics(metrics)

        # --- Save artifacts to temp dir ---
        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = os.path.join(tmpdir, "model.pkl")
            scaler_path = os.path.join(tmpdir, "preprocessing.pkl")
            label_map_path = os.path.join(tmpdir, "label_map.json")

            joblib.dump(model, model_path)
            joblib.dump(scaler, scaler_path)
            with open(label_map_path, "w") as f:
                json.dump(label_map, f)

            # --- Infer signature ---
            signature = infer_signature(
                X_test, pd.DataFrame({"prediction": model.predict(X_test)})
            )

            # --- Log the pyfunc model ---
            # This is the KEY call. It says:
            #   "Use CustomInferenceModel as the serving class,
            #    and pass these artifacts to it at load time."
            mlflow.pyfunc.log_model(
                artifact_path="model",
                python_model=CustomInferenceModel(),
                artifacts={
                    "model": model_path,
                    "preprocessing": scaler_path,
                    "label_map": label_map_path,
                },
                signature=signature,
                input_example=X_test[:3],
            )

        # --- Register model ---
        model_uri = f"runs:/{run.info.run_id}/model"
        registered = mlflow.register_model(
            model_uri=model_uri,
            name=model_name,
        )

        # --- Transition to target stage ---
        client = MlflowClient(tracking_uri)
        target_stage = config["serving"]["stage"]
        client.transition_model_version_stage(
            name=model_name,
            version=registered.version,
            stage=target_stage,
        )

        logger.info(
            "Registered pyfunc model '%s' v%s → %s",
            model_name,
            registered.version,
            target_stage,
        )
        return run.info.run_id, registered.version


def main():
    parser = argparse.ArgumentParser(description="Train and log a model to MLflow")
    parser.add_argument(
        "--framework",
        choices=["sklearn", "xgboost", "pyfunc"],
        default=None,
        help="Override the framework from config",
    )
    parser.add_argument(
        "--config", default="config/model_config.yaml", help="Path to config YAML"
    )
    parser.add_argument(
        "--tracking-uri",
        default=os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000"),
        help="MLflow tracking server URI",
    )
    parser.add_argument(
        "--experiment-name",
        default=os.getenv("MLFLOW_EXPERIMENT_NAME", "inference-service"),
        help="MLflow experiment name",
    )
    args = parser.parse_args()

    # --- Load config ---
    config = load_config(args.config)
    framework = args.framework or config["model"]["framework"]
    model_name = config["model"]["name"]

    logger.info("=== Training Pipeline ===")
    logger.info("Framework: %s", framework)
    logger.info("Model name: %s", model_name)
    logger.info("Tracking URI: %s", args.tracking_uri)

    # --- Data ---
    global y_test_split  # Needed for nested function access
    X, y, label_map = get_data()

    # Train/test split
    test_size = config["training"]["test_size"]
    random_state = config["training"]["random_state"]
    X_train, X_test, y_train, y_test_split = train_test_split(
        X, y, test_size=test_size, random_state=random_state
    )

    # Fit preprocessing scaler on training data
    scaler = StandardScaler()
    numeric_cols = X_train.select_dtypes(include=[np.number]).columns
    X_train[numeric_cols] = scaler.fit_transform(X_train[numeric_cols])
    X_test_scaled = X_test.copy()
    X_test_scaled[numeric_cols] = scaler.transform(X_test_scaled[numeric_cols])

    # --- Train ---
    hyperparams = config["training"]["hyperparams"].get(framework, {})

    if framework == "sklearn":
        model = train_sklearn(X_train, y_train, hyperparams)
        run_id, version = log_and_register_sklearn(
            model,
            X_test_scaled,
            y_test_split,
            scaler,
            label_map,
            config,
            args.tracking_uri,
            args.experiment_name,
            model_name,
        )
    elif framework == "xgboost":
        model = train_xgboost(X_train, y_train, hyperparams)
        run_id, version = log_and_register_pyfunc(
            model,
            scaler,
            X_test_scaled,
            y_test_split,
            label_map,
            config,
            args.tracking_uri,
            args.experiment_name,
            model_name,
        )
    elif framework == "pyfunc":
        model = train_sklearn(
            X_train, y_train, config["training"]["hyperparams"]["sklearn"]
        )
        run_id, version = log_and_register_pyfunc(
            model,
            scaler,
            X_test_scaled,
            y_test_split,
            label_map,
            config,
            args.tracking_uri,
            args.experiment_name,
            model_name,
        )
    else:
        raise ValueError(f"Unsupported framework: {framework}")

    logger.info("=== Done! ===")
    logger.info("Run ID: %s", run_id)
    logger.info("Model version: %s", version)
    logger.info("To serve this model, run:")
    logger.info(
        "  mlflow models serve -m 'models:/%s/%s' --port %d -p %s",
        model_name,
        config["serving"]["stage"],
        config["serving"].get("port", 8787),
        args.tracking_uri,
    )


if __name__ == "__main__":
    main()
