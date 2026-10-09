# WikiWatch workspace

The frontend connects to the local API by default. The API and PostgreSQL 16 run in Docker. Existing SQLite files are retained; PostgreSQL starts with a new database, not imported SQLite records.

## Start locally

Docker Desktop must be running. The backend `.env` already contains a generated local bootstrap password; use the email and password in `wikiwatch-backend/services/wikiwatch-service/.env` to sign in. Keep that file private. For a fresh checkout, copy the service `.env.example` to `.env` and set a password of at least 12 characters first.

From this workspace:

```sh
docker compose up --build -d --wait
cd wikiwatch-web
npm ci
npm run dev
```

Open http://localhost:5173. API health: http://localhost:8000/wikiwatch-service/v1/health. Swagger: http://localhost:8000/wikiwatch-service/v1/swagger.

PostgreSQL is exposed only on loopback port 5433, with database/user `wikiwatch` and local password `local-only-password`. Inside Docker the API connects to `db:5432`; host commands use `localhost:5433`. Local CORS permits localhost and 127.0.0.1 on frontend ports 5173 and 4173.

The start script applies migrations and bootstraps the admin. Existing accounts are kept, so changing the bootstrap password later does not reset them. `WIKIWATCH_SEED_DEMO=false` creates only the admin; manage members after signing in.

`npm run dev` builds then serves the frontend. Restart it after source changes or changes to the API host. An empty `WIKIWATCH_API_HOST` deliberately switches to the frontend demo mode.

## Stop and restart

```sh
docker compose down
docker compose up -d --wait
```

The named database volume survives `down`. Do not add `--volumes` unless you intend to erase PostgreSQL data. API logs: `docker compose logs api`.
