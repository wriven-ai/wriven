# ── Builder ───────────────────────────────────────────────────────────────────────
# Node 22 required: pnpm 11 imports `node:sqlite` (built-in since Node 22.5).
# Node 20 throws ERR_UNKNOWN_BUILTIN_MODULE during `pnpm install`.
FROM node:22-alpine AS builder

WORKDIR /build

# Install pnpm (pinned via packageManager in root package.json)
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate

# Copy package files (for dependency caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Root TS + Nx configs: tsconfig.app.json extends tsconfig.base.json; nx build
# reads nx.json. Without these, webpack/ts-loader throws TS5083.
COPY tsconfig.base.json nx.json ./
COPY apps/auth-service/package.json ./apps/auth-service/
COPY libs/*/package.json ./libs/*/

# Install dependencies
RUN pnpm install --frozen-lockfile --prefer-offline

# Copy source
COPY apps/auth-service ./apps/auth-service
COPY libs/shared ./libs/shared

# Build
RUN pnpm nx build auth-service

# ── Runner ───────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Install dumb-init for signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S wriven && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G wriven -g wriven wriven

# Copy built artifacts
COPY --from=builder /build/apps/auth-service/dist ./dist
COPY --from=builder /build/apps/auth-service/package.json ./
COPY --from=builder /build/node_modules ./node_modules

# Switch to non-root user
USER wriven

# Expose TCP port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
