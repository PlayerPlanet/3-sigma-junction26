#!/usr/bin/env python3
"""
Serving Entrypoint
==================

This script is the ENTRYPOINT for the inference Docker container.
It handles the model loading lifecycle:

  1. Wait for MLflow tracking server to be available
  2. Resolve model URI (by name + stage, e.g., "inference-model/Production")
  3. Download the model artifacts
  4. Launch `mlflow models serve` with the resolved model

WHY THIS EXISTS:
  - `mlflow models serve` needs a URI to load the model
  - In production, we serve by MODEL NAME + STAGE, not by run ID
  - This script resolves "give me the Production version of inference-model"
    into a concrete model URI that mlflow can serve
  - It also adds retry logic for container startup ordering
"""

import os
import sys
import time
import subprocess
import logging
import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def wait_for_tracking_server(uri, timeout=120, interval=5):
    """Block until the MLflow tracking server is reachable."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = requests.get(f"{uri}/health", timeout=5)
            if resp.status_code == 200:
                logger.info("MLflow tracking server is healthy at %s", uri)
                return True
        except requests.ConnectionError:
            pass
        logger.info("Waiting for MLflow tracking server at %s...", uri)
        time.sleep(interval)
    raise TimeoutError(f"MLflow server at {uri} not reachable after {timeout}s")


def resolve_model_uri(tracking_uri, model_name, model_stage):
    """
    Resolve a model name + stage into a model URI.

    Example:
      model_name = "inference-model"
      model_stage = "Production"
      → "models:/inference-model/Production"

    This URI format tells MLflow to:
      1. Look up the Model Registry
      2. Find the model version with stage=Production
      3. Download that version's artifacts
    """
    model_uri = f"models:/{model_name}/{model_stage}"
    logger.info("Resolved model URI: %s", model_uri)
    return model_uri


def start_server(model_uri, port, workers, host="0.0.0.0"):
    """
    Launch `mlflow models serve` as a subprocess.

    This is the command that actually starts the inference HTTP server.
    Under the hood, MLflow:
      1. Downloads the model artifacts from the tracking server
      2. Loads the model using the appropriate flavor
      3. Starts a Flask/gunicorn server with /invocations endpoint
    """
    cmd = [
        "mlflow",
        "models",
        "serve",
        "--model-uri",
        model_uri,
        "--host",
        host,
        "--port",
        str(port),
        "--workers",
        str(workers),
        "--no-conda",  # We manage deps in Docker, not conda
    ]

    logger.info("Starting MLflow inference server:")
    logger.info("  Model URI: %s", model_uri)
    logger.info("  Host: %s", host)
    logger.info("  Port: %d", port)
    logger.info("  Workers: %d", workers)

    # Replace the current process with mlflow serve
    # This ensures signals are properly forwarded
    os.execvp("mlflow", cmd)


def main():
    tracking_uri = os.getenv(
        "MLFLOW_TRACKING_URI", "http://localhost:5000"
    )
    model_name = os.getenv("MODEL_NAME", "inference-model")
    model_stage = os.getenv("MODEL_STAGE", "Production")
    serve_port = int(os.getenv("SERVE_PORT", "8787"))
    num_workers = int(os.getenv("NUM_WORKERS", "2"))

    # Step 1: Wait for tracking server
    wait_for_tracking_server(tracking_uri)

    # Step 2: Resolve model URI
    model_uri = resolve_model_uri(tracking_uri, model_name, model_stage)

    # Step 3: Start serving
    start_server(model_uri, serve_port, num_workers)


if __name__ == "__main__":
    main()
