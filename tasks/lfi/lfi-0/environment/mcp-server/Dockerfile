FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastmcp==4.2.0 numpy==2.3.4 scipy==1.16.3
ENV LFILAB_TABLE=/app/data/lfilab_fsp.npz OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
COPY bayesenv ./bayesenv
# The 21,560 FSP solves of the public model (about 600 CPU-seconds, parallel over the build
# machine's CPUs). Seed-independent: a function of the public code only. Cached by Docker.
RUN python -c "from bayesenv import lfilab as L; L.build_fsp_tables(path=L.table_path())"
COPY server.py ./
EXPOSE 8000 8001
CMD ["python", "server.py"]
