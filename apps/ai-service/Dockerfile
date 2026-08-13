# ── Builder ───────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# The committed uv.lock is the complete, hash-verified dependency resolution.
# `pyproject.toml` is the only editable manifest; no hand-maintained
# requirements.txt can drift from it.
COPY --from=ghcr.io/astral-sh/uv:0.11.17 /uv /uvx /bin/
COPY apps/ai-service/pyproject.toml apps/ai-service/uv.lock ./

# Install locked runtime dependencies to a neutral prefix (NOT /root/.local —
# the runner is non-root). Export is performed inside the build from uv.lock,
# then pip installs exactly that generated set into one copyable directory.
RUN uv export --frozen --no-dev --no-emit-project --no-hashes --output-file /tmp/requirements.txt && \
    pip install --no-cache-dir --target=/opt/deps -r /tmp/requirements.txt

# ── Runner ───────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runner

WORKDIR /app

# dumb-init handles PID 1 / signal forwarding so uvicorn shuts down gracefully.
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user (Debian `addgroup`/`adduser` long-form flags — busybox
# `-S -g` syntax in the skeleton fails on python:*-slim).
RUN addgroup --system --gid 1001 wriven && \
    adduser --system --uid 1001 --ingroup wriven --disabled-login --gecos "" wriven

# Copy dependencies + source.
COPY --from=builder /opt/deps /opt/deps
# Into /app root so `main.py` -> /app/main.py and `app/` -> /app/app/ (uvicorn
# `main:app` resolves from WORKDIR /app). The skeleton's `./src` copy broke this.
COPY apps/ai-service ./

# Make installed packages importable; run uvicorn via `python -m` (no script in PATH).
ENV PYTHONPATH=/opt/deps

# Switch to non-root user
USER wriven

# Expose HTTP port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

ENTRYPOINT ["dumb-init", "--"]
# Run with uvicorn
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
