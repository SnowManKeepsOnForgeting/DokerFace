# DokerFace Backend

## Development

```bash
uv sync --dev
uv run uvicorn app.main:app --reload
```

The API is served under `/api/v1`. Liveness and readiness endpoints are available at
`/api/v1/health/live` and `/api/v1/health/ready`.

