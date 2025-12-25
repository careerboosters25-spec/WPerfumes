# Multi-stage Dockerfile for WPerfumes (Python/Flask + Gunicorn)
# - Builds wheels in a builder stage for reproducible installs
# - Uses a non-root user in the runtime image
# - Expands $PORT at runtime via sh -c so Koyeb's PORT env var is honored

########################################
# Builder stage
########################################
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first to benefit from cache
COPY requirements.txt /app/requirements.txt

# Build wheels into /wheels
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r /app/requirements.txt

########################################
# Runtime stage
########################################
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

# Small runtime deps (libpq for PostgreSQL client)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r app && useradd -r -g app app

WORKDIR /app

# Copy and install wheels from builder
COPY --from=builder /wheels /wheels
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache /wheels/*

# Copy application code
COPY . /app

# Ensure non-root ownership
RUN chown -R app:app /app
USER app

# Use a shell form so $PORT is expanded at container start time by Koyeb
CMD sh -c "gunicorn 'run:app' -b 0.0.0.0:${PORT} -w 4 --threads 2 --timeout 120"