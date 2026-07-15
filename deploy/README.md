# Docker deployment

Create a local environment file and start the stack:

```bash
cp deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.yml up --build
```

The reverse proxy listens on <http://localhost:8080>. PostgreSQL is bound to
`127.0.0.1:5432` for local development and is not exposed on external network interfaces.

Stop the services without deleting data:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml down
```

Do not use `down -v` unless the PostgreSQL data volume should be deleted.

