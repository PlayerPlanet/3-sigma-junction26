FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastmcp==4.2.0 numpy==2.3.4
# neuronbench: vendored source of https://github.com/murphyk/neuronbench (MIT) at the commit
# in neuronbench/PINNED_COMMIT. It holds the world registry, so it stays in this image only.
COPY neuronbench ./neuronbench
COPY bayesenv ./bayesenv
COPY server.py ./
EXPOSE 8000 8001
CMD ["python", "server.py"]
