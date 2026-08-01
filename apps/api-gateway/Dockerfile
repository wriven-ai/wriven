# ── Builder ───────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files (for dependency caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY libs/*/package.json ./libs/*/

# Install dependencies
RUN pnpm install --frozen-lockfile --prefer-offline

# Copy source
COPY apps/api-gateway ./apps/api-gateway
COPY libs/shared ./libs/shared

# Build
RUN pnpm nx build api-gateway

# ── Runner ───────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install dumb-init for signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S wriven && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G wriven -g wriven wriven

# Copy built artifacts
COPY --from=builder /build/apps/api-gateway/dist ./dist
COPY --from=builder /build/apps/api-gateway/package.json ./
COPY --from=builder /build/node_modules ./node_modules

# Switch to non-root user
USER wriven

# Expose HTTP port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
