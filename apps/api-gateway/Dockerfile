# Node 22 — pnpm 11 needs node:sqlite
FROM node:22-alpine AS builder

WORKDIR /build

RUN corepack enable && corepack prepare pnpm@11.15.1 --activate

# Dep manifests first for layer cache
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json nx.json ./
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY libs/shared/common/package.json ./libs/shared/common/
COPY libs/shared/constants/package.json ./libs/shared/constants/
COPY libs/shared/contracts/package.json ./libs/shared/contracts/
COPY libs/shared/database/package.json ./libs/shared/database/
COPY libs/shared/types/package.json ./libs/shared/types/

RUN pnpm install --frozen-lockfile --prefer-offline

COPY apps/api-gateway ./apps/api-gateway
COPY libs/shared ./libs/shared

# tsc -b first (composite refs), then nx build
ENV NX_DAEMON=false
ENV CI=true
RUN pnpm exec tsc -b \
      libs/shared/contracts/tsconfig.lib.json \
      libs/shared/database/tsconfig.lib.json \
      libs/shared/types/tsconfig.lib.json \
      libs/shared/common/tsconfig.lib.json \
      libs/shared/constants/tsconfig.lib.json && \
    pnpm nx build api-gateway --skip-sync

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache dumb-init

RUN addgroup -g 1001 -S wriven && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G wriven -g wriven wriven

COPY --from=builder /build/apps/api-gateway/dist ./dist
COPY --from=builder /build/apps/api-gateway/package.json ./
COPY --from=builder /build/node_modules ./node_modules

USER wriven

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
