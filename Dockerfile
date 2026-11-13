# ==============================================================
# MLflow Tracking Server Dockerfile
# ==============================================================
# This runs the MLflow tracking server — the "database" for your
# models. In production, you'd typically use a managed database
# (PostgreSQL) instead of SQLite.
#
# The tracking server provides:
#   - Web UI at http://localhost:5000
#   - REST API for logging/querying runs
#   - Model Registry for versioning deployments
# ==============================================================

FROM python:3.11-slim

# Install system deps for MLflow (only what's needed)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /mlflow

# Install MLflow with the extras needed for serving
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create directories for artifact storage
RUN mkdir -p /mlflow/artifacts /mlflow/db

# Expose the MLflow tracking server port
EXPOSE 5000

# Health check — MLflow server responds to GET /
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5000/health')" || exit 1

# Run MLflow tracking server
# --host 0.0.0.0   → listen on all interfaces (needed for Docker)
# --backend-store-uri   → where to store run metadata (SQLite for dev)
# --default-artifact-root → where to store model artifacts (local for dev)
CMD ["mlflow", "server", \
     "--host", "0.0.0.0", \
     "--port", "5000", \
     "--backend-store-uri", "sqlite:///mlflow/db/mlflow.db", \
     "--default-artifact-root", "/mlflow/artifacts"]
