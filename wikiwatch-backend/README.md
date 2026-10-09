# WikiWatch backend

This is the instructor-provided backend for the frontend assignment.
Trainees use the APIs. They do not build this service.

## Code layout

| Folder | Purpose |
| --- | --- |
| `services/wikiwatch-service/app/api/v1/endpoints` | HTTP routes and Swagger descriptions |
| `app/schemas` | Request and response data structures |
| `app/services` | Permissions, transitions and transaction boundaries |
| `app/repositories` | Reusable database reads and version checks |
| `app/models` | Database tables and constraints |
| `app/dependencies` | Session authentication and request-scoped access |
| `app/core` | Settings, database, security, errors and enums |
| `app/middlewares` | CORS, login rate limits and request logging |
| `migrations` | Explicit, versioned schema changes |
| `tests` | Role workflows, claim races, comments and migrations |

The service includes `pyproject.toml`, `uv.lock`, `Makefile`, Docker files and Alembic configuration.
Database schemas are not created on API startup. Run migrations first.
There is one shared team per deployment. This is not a multi-tenant service.

## Start locally

Use Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
cd services/wikiwatch-service
cp .env.example .env
uv sync --locked
uv run alembic upgrade head
```

Set `WIKIWATCH_BOOTSTRAP_PASSWORD` in `.env` to your own password of at least 12 characters.
Set `WIKIWATCH_SEED_DEMO=true` to create the four training accounts.

```bash
uv run python -m app.seed
uv run uvicorn app.main:app --reload --port 8000
```

Open [Swagger](http://localhost:8000/wikiwatch-service/v1/swagger).
ReDoc is at `/wikiwatch-service/v1/redoc`.
The OpenAPI schema is at `/wikiwatch-service/v1/openapi.json`.
Swagger UI assets are bundled with the service; no CDN is needed for Swagger. ReDoc uses its default CDN.
A generated schema is also included as `WikiWatch-openapi.json`.

| Account | Role |
| --- | --- |
| dev@example.org | Reviewer |
| amir@example.org | Reviewer |
| sara@example.org | Team lead |
| noor@example.org | Admin |

These are real database accounts. They all use the password you supply during bootstrap.
There is no built-in password or public signup.
Bootstrap skips existing accounts; it does not reset their passwords or roles.
With `WIKIWATCH_SEED_DEMO=false`, bootstrap creates only the admin account.
The admin can create the other members through the API. No invitation email is sent.
