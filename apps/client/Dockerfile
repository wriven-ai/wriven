# ── Builder ───────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files (for dependency caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json ./apps/client/

# Install dependencies
RUN pnpm install --frozen-lockfile --prefer-offline

# Copy source
COPY apps/client ./apps/client

# Build Next.js app
RUN pnpm nx build @wriven/client

# ── Runner ───────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install dumb-init for signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S wriven && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G wriven -g wriven wriven

# Set production environment
ENV NODE_ENV=production

# Copy Next.js build output
COPY --from=builder /build/apps/client/.next ./.next
COPY --from=builder /build/apps/client/public ./public
COPY --from=builder /build/apps/client/package.json ./
COPY --from=builder /build/apps/client/next.config.js ./next.config.js

# Install only production dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    pnpm install --prod --frozen-lockfile --silent

# Switch to non-root user
USER wriven

# Expose HTTP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["pnpm", "start"]
