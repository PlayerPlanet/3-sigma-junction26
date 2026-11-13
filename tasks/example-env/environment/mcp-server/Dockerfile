FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir fastmcp==4.2.0

COPY game.py server.py ./

EXPOSE 8000 8001
CMD ["python", "server.py"]
