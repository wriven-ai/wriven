# Docker Setup for Wriven

Complete containerized development and production setup for the Wriven monorepo.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Client    │────▶│  API Gateway │────▶│ Auth Service │
│  (Next.js)  │     │  (NestJS)    │     │  (NestJS)    │
│   :3000     │     │    :5000     │◄────│    :5001     │
└─────────────┘     └──────────────┘     └──────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │ Core Service │
                   │  (NestJS)    │
                   │    :5002     │
                   └──────────────┘
```

All services communicate over Docker bridge network `wriven-net`. PostgreSQL and Redis are included for local dev; production uses Supabase.

---

## Quick Start

### 1. Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 4GB RAM minimum (8GB recommended)

### 2. Environment Variables

Copy the example env file:

```bash
cp .env.docker.example .env
```

Edit `.env` and set at minimum:
- `DATABASE_URL` / `DIRECT_URL` (use postgres compose for local, or Supabase)
- `JWT_SECRET` / `REFRESH_SECRET` / `ADMIN_JWT_SECRET` (generate: `openssl rand -base64 32`)
- R2 credentials for storage (skip for local-only testing)

### 3. Build & Run

```bash
# Build all services
make build

# Start everything (detached)
make up-d

# View logs
make logs

# Check health
make health
```

Services available at:
- Client: http://localhost:3000
- API Gateway: http://localhost:5000/api/v1
- Auth Service (TCP): localhost:5001
- Core Service (TCP): localhost:5002

### 4. Database Migrations

After first start, run migrations:

```bash
make db-migrate
```

---

## Dockerfile Details

### Shared Pattern

All Dockerfiles follow the same multi-stage build:

1. **Builder stage**: Node 20 Alpine, install pnpm, copy workspace, build with Nx
2. **Runner stage**: Node 20 Alpine, dumb-init, non-root user (`wriven:1001`), health checks

### Service-Specific

| Service | Base Image | Port | Health Check | Special |
|---------|------------|------|--------------|---------|
| auth-service | node:20-alpine | 5001 TCP | `/health` | TCP microservice |
| core-service | node:20-alpine | 5002 TCP | `/health` | TCP microservice |
| api-gateway | node:20-alpine | 5000 HTTP | `/api/v1/health` | Public entry |
| client | node:20-alpine | 3000 HTTP | `/api/health` | Next.js SSR |
| ai-service | python:3.12-slim | 8000 HTTP | `/health` | FastAPI (optional) |

---

## Development vs Production

### Local Development (`docker-compose.yml`)

- **Postgres included**: Fresh database every `docker-compose down -v`
- **Redis included**: For caching (optional)
- **Source mounting**: None — rebuild required for changes (intentional; use Nx watch locally for dev)
- **Hot reload**: Not enabled in Docker — use `pnpm nx serve <service>` directly for development

**Best for**: Testing container behavior, integration tests, reproducing production bugs.

### Production (`docker-compose.prod.yml`)

- **No DB/Redis**: Uses external Supabase
- **Replicas**: 2-3 per service for HA
- **Resource limits**: CPU + memory constraints
- **Restart policy**: On-failure with backoff
- **Load balancer**: Deploy API Gateway with 3 replicas behind external LB

**Best for**: Staging and production deployments.

---

## Common Operations

### View Logs

```bash
# All services
make logs

# Specific service
make logs-auth
make logs-core
make logs-gateway
make logs-client
```

### Restart Services

```bash
# Restart all (no rebuild)
make restart

# Rebuild from scratch + restart
make rebuild
```

### Enter Container

```bash
# Auth service shell
docker-compose exec auth-service sh

# Core service shell
docker-compose exec core-service sh

# Run one-off command
docker-compose exec api-gateway npx nx test
```

### Clean Up

```bash
# Stop + remove containers
make down

# Stop + remove volumes (deletes DB data!)
make clean

# Prune all unused images
make prune
```

---

## Troubleshooting

### Services Can't Connect

- Check they're on `wriven-net` network: `docker network ls`
- Verify env vars: `docker-compose config`
- Logs: `make logs`

### Build Failures

- Clear Docker build cache: `docker builder prune -a`
- Rebuild without cache: `docker-compose build --no-cache <service>`
- Check disk space: `docker system df`

### Port Conflicts

Ports used: 3000, 5000, 5001, 5002, 5432, 6379, 8000.

Change in `docker-compose.yml` under `ports:` section.

### Permission Errors

All containers run as non-root `wriven:1001`. If you see permission errors, ensure mounted volumes (if any) are chowned correctly.

---

## CI/CD Integration

### Build & Push

```bash
# Set version/tag
export TAG=v1.0.0

# Tag all images
make tag-all

# Push to registry (configure auth first)
make push-all
```

### Registry Configuration

Add to your CI/CD pipeline:

```bash
echo $DOCKER_PASSWORD | docker login -u $DOCKER_USER --password-stdin
```

---

## Production Deployment Checklist

- [ ] Replace `DATABASE_URL` with Supabase pooled connection
- [ ] Set strong secrets (`JWT_SECRET`, `ADMIN_JWT_SECRET`)
- [ ] Configure R2 storage credentials
- [ ] Set up external load balancer (AWS ALB, Cloudflare, etc.)
- [ ] Enable HTTPS/TLS at LB level
- [ ] Configure log aggregation (CloudWatch, Datadog, etc.)
- [ ] Set monitoring alerts on health endpoints
- [ ] Run DB migrations before deploy
- [ ] Test rollback plan (previous working tag)

---

## Performance Tuning

### Resource Limits (adjust in docker-compose.prod.yml)

Current defaults:
- CPU: 0.5 cores (limit), 0.25 (reservation)
- Memory: 512M (limit), 256M (reservation)

Adjust based on load:
- Gateway: More replicas (3-5) for API-heavy workloads
- Core: More memory if large content operations
- Client: More replicas if traffic is high

### Node.js Flags

Add to `CMD` in Dockerfiles if needed:

```dockerfile
CMD ["node", "--max-old-space-size=512", "dist/main.js"]
```

---

## Security Notes

1. **Non-root user**: All services run as `wriven:1001`
2. **Secrets**: Never commit `.env`. Use Docker secrets or external vault in production
3. **Image scanning**: Run `docker scan wriven/api-gateway:latest` before deploy
4. **Base images**: Use specific tags (not `latest`) in production
5. **Network isolation**: Services only communicate on `wriven-net`

---

## Migration from Local Dev

Current setup uses `pnpm nx serve` for local development. Docker is **not** a replacement for that — it's for:

1. **Production-like testing** locally
2. **Staging/production deployment**
3. **CI/CD pipelines**
4. **Reproducing customer issues**

For day-to-day development, continue using `pnpm nx serve <service>` directly.

---

## Next Steps

1. Set up external Postgres (Supabase/RDS) for production
2. Configure log aggregation (Datadog/New Relic)
3. Set up CI/CD pipeline (GitHub Actions, GitLab CI)
4. Add monitoring (Prometheus/Grafana or Datadog APM)
5. Configure automated backups (R2/Backblaze for media)
6. Set up external load balancer with SSL/TLS

See [doc/17-market-readiness.md](doc/17-market-readiness.md) for production deployment gaps.
