# WikiWatch backend

This is the instructor-provided backend for the frontend assignment.
Trainees use the APIs. They do not build this service.

Python, FastAPI, async SQLAlchemy and Alembic follow the supplied [IAM service structure](https://github.com/Huzaifa1911/smart-hire/tree/main/services/iam-service).
The reference contains contract-only IAM handlers. WikiWatch implements its handlers and database writes.

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

SQLite is the local default. Its database file survives API process restarts.
Use PostgreSQL for a shared or hosted deployment.
To run local PostgreSQL and the API, run `docker compose up --build` from the service folder.
To bootstrap Docker accounts, pass the bootstrap variables explicitly to `docker compose exec -e ... api python -m app.seed`.
The Compose password is for a disposable local database only.

## What is implemented

- Login, rotating access and refresh tokens, logout and current account.
- Member creation, role changes and account disablement.
- Shared edit admission, filtering and pagination.
- Claims, assignment, OK decisions, flags, verification, returns and reopening.
- Board counts, reviewer workload and saved column order.
- Plain-text line comments, replies, thread resolution and author-only thread deletion.
- Database audit records, search and safe CSV export.
- Activity aggregation for Recharts.
- Durable change cursors for browser polling and reconnect catch-up.
- Archiving eligible queue entries.

Wikimedia SSE and revision reads remain public browser calls.
A WikiWatch flag is an internal review decision. It does not revert Wikipedia.
The API does not implement Wikipedia edits, rollback, an LLM assistant, presence or typing indicators.
Those features are outside the current three-role product.

The existing HTML demo still uses its browser mock store. This package supplies the replacement API.
See [the frontend integration guide](docs/FRONTEND.md) for the mapping. It has not yet been wired into that demo.

## Verify

```bash
uv run ruff check .
uv run pytest -q
uv run alembic check
```

The delivered suite passes 11 integration tests on a real SQLite database.
It covers a simultaneous two-user claim attempt, status transitions, role denial,
refresh-token rotation, persistent threads, author-only deletion, account disablement,
app restart, CORS, login throttling, chart counts and explicit schema migrations.

PostgreSQL execution and cloud deployment were not run in this workspace.
The included GitHub Actions job provisions PostgreSQL 17 and runs migrations, drift checks and the same workflow tests.
Run it before connecting the hosted frontend.
Tests erase the tables in `TEST_DATABASE_URL`. Always use a disposable test database.

For free hosting, use [the deployment guide](docs/DEPLOYMENT.md).
