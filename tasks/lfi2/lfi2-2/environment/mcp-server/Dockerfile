FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastmcp==4.2.0 numpy==2.3.4 scipy==1.16.3
ENV LFILAB2_TABLE=/app/data/lfilab2_exact.npz OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
# The exact FSP tables (62,208 two-species solves, about 40 CPU-hours, computed once on Modal:
# experiments/lfilab2_modal.py::table, then ::fetch into data/). Not tracked in git (360 MB):
# scripts/make_lfi2_tasks.py copies data/lfilab2_exact.npz here when it exists.
COPY data ./data
COPY bayesenv ./bayesenv
COPY server.py ./
EXPOSE 8000 8001
CMD ["python", "server.py"]
