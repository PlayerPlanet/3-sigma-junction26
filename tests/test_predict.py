"""
Integration Tests for Inference API
====================================

These tests verify the MLflow serving endpoints work correctly.
They assume the stack is running via docker-compose.

MLflow's built-in server exposes two endpoints:
  - GET  /health          → Health check
  - POST /invocations     → Get predictions (JSON input)

The /invocations endpoint is the MAIN endpoint. It accepts:
  - {"dataframe_split": {"columns": [...], "data": [...]}}
  - {"dataframe_records": [{"col1": val1, ...}]}

USAGE:
  pytest tests/test_predict.py -v
  # Or with the stack running:
  BASE_URL=http://localhost:8787 pytest tests/test_predict.py -v
"""

import os
import json
import pytest
import requests
import numpy as np

# Default to localhost; override in CI environments
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")


class TestHealthCheck:
    """Verify the inference server is healthy and responsive."""

    def test_health_endpoint_returns_200(self):
        """The /health endpoint should return 200 when the server is ready."""
        resp = requests.get(f"{BASE_URL}/health", timeout=10)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"

    def test_ping_endpoint(self):
        """MLflow also provides a /ping endpoint for load balancers."""
        resp = requests.get(f"{BASE_URL}/ping", timeout=10)
        assert resp.status_code == 200


class TestPredictions:
    """Test prediction endpoints with various input formats."""

    @pytest.fixture
    def sample_input_split(self):
        """DataFrame split format — the most common MLflow serving format."""
        from sklearn.datasets import load_iris

        data = load_iris()
        return {
            "dataframe_split": {
                "columns": data.feature_names,
                "data": data.data[:3].tolist(),  # First 3 samples
            }
        }

    @pytest.fixture
    def sample_input_records(self):
        """DataFrame records format — JSON-friendly dict format."""
        from sklearn.datasets import load_iris

        data = load_iris()
        return {
            "dataframe_records": [
                dict(zip(data.feature_names, row)) for row in data.data[:3]
            ]
        }

    def test_predict_split_format(self, sample_input_split):
        """
        Test prediction using dataframe_split format.

        This is the RECOMMENDED format for MLflow serving.
        It matches pandas.DataFrame.to_dict(orient='split').
        """
        resp = requests.post(
            f"{BASE_URL}/invocations",
            json=sample_input_split,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        result = resp.json()
        assert "predictions" in result, f"Response missing 'predictions' key: {result}"

    def test_predict_records_format(self, sample_input_records):
        """Test prediction using dataframe_records format (list of dicts)."""
        resp = requests.post(
            f"{BASE_URL}/invocations",
            json=sample_input_records,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        result = resp.json()
        assert "predictions" in result, f"Response missing 'predictions' key: {result}"

    def test_predict_returns_valid_predictions(self, sample_input_split):
        """Verify predictions are valid Iris class labels."""
        resp = requests.post(
            f"{BASE_URL}/invocations",
            json=sample_input_split,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        result = resp.json()
        predictions = result["predictions"]

        # Iris has 3 classes: 0, 1, 2 (or setosa, versicolor, virginica)
        assert len(predictions) == 3, f"Expected 3 predictions, got {len(predictions)}"


class TestErrorHandling:
    """Verify the API handles bad requests gracefully."""

    def test_invalid_json_returns_error(self):
        """Malformed JSON should return a 4xx error, not crash the server."""
        resp = requests.post(
            f"{BASE_URL}/invocations",
            data="not json at all",
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        assert resp.status_code in (400, 422, 500)

    def test_wrong_content_type(self):
        """Sending form data instead of JSON should fail gracefully."""
        resp = requests.post(
            f"{BASE_URL}/invocations",
            data="key=value",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )
        assert resp.status_code in (400, 422, 500)

    def test_empty_payload(self):
        """An empty body should not crash the server."""
        resp = requests.post(
            f"{BASE_URL}/invocations",
            json={},
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        # Should return an error, not crash
        assert resp.status_code in (400, 422, 500)
