## Local Docker setup in this workspace

This workspace now uses Docker PostgreSQL 16 and the Docker API for local development. Copy `.env.example` to `.env` only for a fresh checkout, then set `WIKIWATCH_BOOTSTRAP_PASSWORD` (12+ characters). Run `docker compose up --build -d --wait` in this folder or at the workspace root. The frontend runs at http://localhost:5173 with `npm run dev` in `wikiwatch-web`.

Host Python commands connect to `localhost:5433`; the API container connects to `db:5432`. The PostgreSQL named volume survives restarts. SQLite remains available for isolated tests; existing SQLite records are not copied to PostgreSQL.

See the workspace README for current local and deployment instructions.

# wikiwatch-service

Run commands from this folder. See [the project README](../../README.md) for setup

Swagger: `/wikiwatch-service/v1/swagger`.
All implemented application routes use `/wikiwatch-service/v1`.
