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

## Deploy

Use GitHub Pages for the frontend and Render for the Docker API. Render needs a hosted PostgreSQL database: it cannot connect to the database on your laptop.

1. Create a hosted PostgreSQL database (the existing deployment guide uses Neon Free). Copy its direct connection URL with SSL enabled.
2. Upload the entire `wikiwatch-workspace` to one GitHub repository. Keep `render.yaml` and `.github/workflows` at the repository root; keep the frontend and backend in their existing subfolders.
3. In Render, create a Blueprint for the repository. Set `WIKIWATCH_DATABASE_URL` to the hosted database connection URL; `WIKIWATCH_CORS_ALLOW_ORIGINS` to `["https://YOUR-ACCOUNT.github.io"]`; and your chosen production bootstrap email/password. Use a different password from local development. The API is configured on the free service plan.
4. Wait for the health endpoint at `https://YOUR-SERVICE.onrender.com/wikiwatch-service/v1/health`, then verify login through Swagger.
5. On this GitHub repository, set the Actions repository variable `WIKIWATCH_API_HOST` to `https://YOUR-SERVICE.onrender.com` (origin only), and set Pages source to GitHub Actions. Push to `main`. The root Pages workflow builds `wikiwatch-web` and publishes `wikiwatch-web/dist`.
6. Sign in through the published frontend and verify a shared action. After the first successful deployment, set `WIKIWATCH_SEED_ON_DEPLOY=false` and remove the bootstrap password from Render.

The root `.github/workflows/pages.yml` deploys the frontend, and `.github/workflows/backend.yml` checks the backend against PostgreSQL. The single root `render.yaml` deploys the backend from `wikiwatch-backend/services/wikiwatch-service`.

CORS uses the Pages origin, without a repository path. Local `.env` files do not configure GitHub Actions or Render. The frontend build embeds only the public API host, never database credentials.

Render free API services sleep after inactivity. Render free PostgreSQL databases expire after 30 days; use Neon or an appropriate paid database for longer-lived data. See [Render free limits](https://render.com/docs/free), [Render Blueprints](https://render.com/docs/blueprint-spec), and [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
