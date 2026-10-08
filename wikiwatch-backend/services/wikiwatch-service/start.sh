#!/bin/sh
set -eu
alembic upgrade head
if [ "${WIKIWATCH_SEED_ON_DEPLOY:-false}" = "true" ]; then
    python -m app.seed
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
