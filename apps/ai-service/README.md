# Wriven AI service

Internal FastAPI service for CMS text generation. It is reachable only from
core-service, which supplies the workspace, project, field policy, quota, and
audit context. This service owns prompt assembly, bounded provider calls, and
provider-safe observability.

## Dependencies

`pyproject.toml` is the editable dependency manifest and `uv.lock` is the
committed exact resolution used by deployment. Update dependencies with:

```sh
uv lock
```

The Docker build exports its runtime dependencies directly from `uv.lock`; do
not add a separate `requirements.txt`.

## Operational endpoints

- `GET /health` — process liveness
- `GET /ready` — liveness plus provider configuration
- `GET /metrics` — private Prometheus metrics; deploy only on the internal network
