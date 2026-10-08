setup:
	uv sync --locked
migrate:
	uv run alembic upgrade head
seed:
	uv run python -m app.seed
run:
	uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
lint:
	uv run ruff check .
test:
	uv run pytest -q
