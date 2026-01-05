# ═══════════════════════════════════════════════════════════════════════════════
# DivertScan™ Apex Enterprise - Production Dockerfile
# Multi-stage build for optimized container
# ═══════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Frontend Build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# Copy source and build
COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Backend Base
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS backend-base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set environment
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Production Image
# ─────────────────────────────────────────────────────────────────────────────
FROM backend-base AS production

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser

# Copy backend code
COPY src/backend/ ./src/backend/

# Copy frontend build
COPY --from=frontend-builder /app/dist ./static

# Set ownership
RUN chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run with gunicorn
CMD ["gunicorn", "src.backend.main:app", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--capture-output"]

# ─────────────────────────────────────────────────────────────────────────────
# Stage: Development Image
# ─────────────────────────────────────────────────────────────────────────────
FROM backend-base AS development

# Install dev dependencies
RUN pip install watchfiles

# Copy all code
COPY . .

EXPOSE 8000 5173

# Development command
CMD ["uvicorn", "src.backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
