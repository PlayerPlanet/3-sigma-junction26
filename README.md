# Bitshift Happens

**Team 3-Sigma · Junction 2026**

> Obsessed about maximizing shareholder value.

## Challenge

TODO: challenge / track, problem statement, and what we're building.

## Stack

MLflow-backed train → serve pipeline in Docker (generated from `cookiecutter-inference-template`).

| Component | File |
|-----------|------|
| MLflow tracking server | `Dockerfile`, `docker-compose.yml` |
| Training job | `Dockerfile.train`, `src/train.py` |
| Inference server (CPU / GPU) | `Dockerfile.serve`, `Dockerfile.serve.gpu`, `scripts/serve_entrypoint.py` |
| Custom pyfunc model | `src/custom_model.py` |
| Config | `config/model_config.yaml`, `.env.example` |

## Quickstart

```bash
cp .env.example .env
docker compose up --build
```

Run the tests:

```bash
pip install -r requirements.txt
pytest
```

## Team

TODO: names and roles.
