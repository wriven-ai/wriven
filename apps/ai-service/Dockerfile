# ── Builder ───────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY apps/ai-service/requirements.txt ./requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir --user -r requirements.txt

# ── Runner ───────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runner

WORKDIR /app

# Install dumb-init for signal handling
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup -g 1001 -S wriven && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G wriven -g wriven wriven

# Copy Python packages from builder
COPY --from=builder /root/.local /root/.local

# Copy source
COPY apps/ai-service ./src

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Switch to non-root user
USER wriven

# Expose HTTP port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Run with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
