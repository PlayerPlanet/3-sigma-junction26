"""
Custom PyFunc Model Wrapper
===========================

WHY THIS EXISTS:
  MLflow has built-in "flavors" for sklearn, xgboost, etc.
  But real-world models often need:
  - Custom preprocessing (scaling, encoding, tokenization)
  - Post-processing (thresholding, label mapping)
  - Business logic (feature engineering at serve time)

  The pyfunc flavor gives you a `.predict()` interface where
  YOU control everything inside. This is the "generic" approach.

HOW IT WORKS:
  1. Subclass `PythonModel` from mlflow.pyfunc
  2. Implement `load_context()` — runs once when model loads
  3. Implement `predict()` — runs on every request

  MLflow serializes the entire class + its artifacts, so when
  you `mlflow models serve`, it reconstructs your object and
  calls predict() with the incoming data.
"""

import mlflow.pyfunc
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)


class CustomInferenceModel(mlflow.pyfunc.PythonModel):
    """
    A generic wrapper that handles preprocessing + prediction + postprocessing.

    This demonstrates the three key methods you override:
      - load_context: one-time setup (load preprocessing artifacts)
      - predict: the inference pipeline
    """

    def load_context(self, context):
        """
        Called ONCE when the model is loaded by MLflow serving.

        context.artifacts is a dict mapping artifact names to file paths.
        Whatever you saved in mlflow.log_artifact() appears here.

        In this template, we save:
          - "preprocessing.pkl" — fitted scaler/encoder
          - "label_map.json" — mapping from integer labels to human-readable
        """
        import joblib
        import json

        # Load preprocessing pipeline (scaler, encoder, etc.)
        scaler_path = context.artifacts.get("preprocessing")
        if scaler_path:
            self.scaler = joblib.load(scaler_path)
            logger.info("Loaded preprocessing scaler from %s", scaler_path)
        else:
            self.scaler = None

        # Load label mapping
        label_map_path = context.artifacts.get("label_map")
        if label_map_path:
            with open(label_map_path, "r") as f:
                self.label_map = json.load(f)
            logger.info("Loaded label map with %d classes", len(self.label_map))
        else:
            self.label_map = None

    def predict(self, context, model_input):
        """
        Called on EVERY inference request.

        model_input: pandas DataFrame (MLflow serves convert JSON → DataFrame)

        Pipeline: preprocess → predict → postprocess

        Returns: pandas DataFrame with predictions
        """
        # Step 1: Preprocess
        processed = self._preprocess(model_input)

        # Step 2: The actual model prediction
        # context.artifacts["model"] points to the serialized model file
        raw_preds = self._raw_predict(context, processed)

        # Step 3: Postprocess
        result = self._postprocess(raw_preds)

        return result

    def _preprocess(self, df):
        """Apply saved preprocessing transformations."""
        if self.scaler is not None:
            # Scale numeric columns using the fitted scaler
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            df[numeric_cols] = self.scaler.transform(df[numeric_cols])
        return df

    def _raw_predict(self, context, df):
        """Delegate to the underlying model file."""
        import joblib

        model_path = context.artifacts["model"]
        model = joblib.load(model_path)
        return model.predict(df)

    def _postprocess(self, predictions):
        """Map numeric predictions to human-readable labels."""
        if self.label_map is not None:
            # Convert string keys to int keys if needed
            label_map = {int(k): v for k, v in self.label_map.items()}
            predictions = pd.Series(predictions).map(label_map).values

        return pd.DataFrame({"prediction": predictions})
