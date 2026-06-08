# VIPER backend — FastAPI + SQLAlchemy, served by uvicorn.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code (build context is ./backend).
COPY . .

EXPOSE 8000

# Start the API. Schema migrations are applied by the app's startup hook
# (database.run_migrations) — the single source of truth, which also covers the
# native `python main.py` run. The DB is reachable thanks to the compose
# healthcheck + depends_on ordering.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
