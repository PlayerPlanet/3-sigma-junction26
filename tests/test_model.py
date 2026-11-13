"""
Unit Tests for Model Training Pipeline
=======================================

These tests verify the training logic WITHOUT needing a running
MLflow server. They test:
  - Data loading
  - Preprocessing
  - Model training
  - Custom pyfunc model wrapper

USAGE:
  pytest tests/test_model.py -v
"""

import pytest
import numpy as np
import pandas as pd
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier


# ── Fixtures ────────────────────────────────────────────────


@pytest.fixture
def iris_data():
    """Load Iris dataset split into train/test."""
    data = load_iris()
    X = pd.DataFrame(data.data, columns=data.feature_names)
    y = pd.Series(data.target)
    return X, y, data.target_names


@pytest.fixture
def split_data(iris_data):
    """Train/test split with scaling."""
    X, y, target_names = iris_data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    scaler = StandardScaler()
    numeric_cols = X_train.select_dtypes(include=[np.number]).columns
    X_train_scaled = X_train.copy()
    X_test_scaled = X_test.copy()
    X_train_scaled[numeric_cols] = scaler.fit_transform(X_train[numeric_cols])
    X_test_scaled[numeric_cols] = scaler.transform(X_test[numeric_cols])

    return X_train_scaled, X_test_scaled, y_train, y_test, scaler


@pytest.fixture
def trained_model(split_data):
    """A fitted RandomForest model."""
    X_train, _, y_train, _, _ = split_data
    model = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42)
    model.fit(X_train, y_train)
    return model


# ── Data Tests ──────────────────────────────────────────────


class TestDataLoading:
    """Verify data loading and preprocessing."""

    def test_iris_loads_correctly(self, iris_data):
        X, y, target_names = iris_data
        assert len(X) == 150, "Iris should have 150 samples"
        assert X.shape[1] == 4, "Iris should have 4 features"
        assert len(target_names) == 3, "Iris should have 3 classes"

    def test_train_test_split_sizes(self, split_data):
        X_train, X_test, y_train, y_test, _ = split_data
        assert len(X_train) == 120, "80% of 150 = 120"
        assert len(X_test) == 30, "20% of 150 = 30"

    def test_scaler_is_fitted(self, split_data):
        _, _, _, _, scaler = split_data
        assert hasattr(scaler, "mean_"), "Scaler should be fitted"
        assert hasattr(scaler, "scale_"), "Scaler should have scale_ attribute"


# ── Model Tests ──────────────────────────────────────────────


class TestModelTraining:
    """Verify model training and evaluation."""

    def test_model_is_fitted(self, trained_model):
        assert hasattr(trained_model, "n_features_in_"), "Model should be fitted"

    def test_model_accuracy(self, trained_model, split_data):
        _, X_test, _, y_test, _ = split_data
        accuracy = trained_model.score(X_test, y_test)
        assert accuracy >= 0.9, (
            f"Iris model should achieve ≥90% accuracy, got {accuracy:.2%}"
        )

    def test_model_predicts_valid_classes(self, trained_model, split_data):
        _, X_test, _, _, _ = split_data
        predictions = trained_model.predict(X_test)
        assert set(predictions).issubset({0, 1, 2}), (
            "Predictions should be valid Iris classes"
        )


# ── PyFunc Wrapper Tests ────────────────────────────────────


class TestPyFuncWrapper:
    """Test the custom pyfunc model wrapper."""

    def test_custom_model_class_exists(self):
        """Verify the CustomInferenceModel can be imported."""
        from src.custom_model import CustomInferenceModel

        model = CustomInferenceModel()
        assert hasattr(model, "predict"), "Should have predict method"
        assert hasattr(model, "load_context"), "Should have load_context method"

    def test_custom_model_loads_artifacts(self, tmp_path, trained_model, split_data):
        """Test that load_context properly loads artifacts."""
        import joblib
        import json
        from src.custom_model import CustomInferenceModel

        _, _, _, _, scaler = split_data

        # Save artifacts to temp directory
        model_path = str(tmp_path / "model.pkl")
        scaler_path = str(tmp_path / "preprocessing.pkl")
        label_map_path = str(tmp_path / "label_map.json")

        joblib.dump(trained_model, model_path)
        joblib.dump(scaler, scaler_path)
        with open(label_map_path, "w") as f:
            json.dump({"0": "setosa", "1": "versicolor", "2": "virginica"}, f)

        # Create a mock context
        class MockContext:
            artifacts = {
                "model": model_path,
                "preprocessing": scaler_path,
                "label_map": label_map_path,
            }

        model = CustomInferenceModel()
        model.load_context(MockContext())

        assert model.scaler is not None, "Scaler should be loaded"
        assert model.label_map is not None, "Label map should be loaded"

    def test_custom_model_predict(self, tmp_path, trained_model, split_data):
        """End-to-end test of the pyfunc predict pipeline."""
        import joblib
        import json
        from src.custom_model import CustomInferenceModel

        X_train, X_test, y_train, y_test, scaler = split_data
        target_names = ["setosa", "versicolor", "virginica"]

        # Save artifacts
        model_path = str(tmp_path / "model.pkl")
        scaler_path = str(tmp_path / "preprocessing.pkl")
        label_map_path = str(tmp_path / "label_map.json")

        joblib.dump(trained_model, model_path)
        joblib.dump(scaler, scaler_path)
        label_map = {str(i): name for i, name in enumerate(target_names)}
        with open(label_map_path, "w") as f:
            json.dump(label_map, f)

        # Mock context
        class MockContext:
            artifacts = {
                "model": model_path,
                "preprocessing": scaler_path,
                "label_map": label_map_path,
            }

        model = CustomInferenceModel()
        model.load_context(MockContext())

        # Run prediction
        result = model.predict(MockContext(), X_test)

        assert isinstance(result, pd.DataFrame), "Should return DataFrame"
        assert "prediction" in result.columns, "Should have 'prediction' column"
        assert len(result) == len(X_test), "Should have one prediction per input"
