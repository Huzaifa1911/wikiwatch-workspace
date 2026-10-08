import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def test_explicit_migrations_build_valid_schema(tmp_path):
    database = tmp_path / "migration.db"
    env = {**os.environ, "WIKIWATCH_DATABASE_URL": "sqlite+aiosqlite:///" + str(database)}
    service = Path(__file__).resolve().parents[1]
    for arguments in [["upgrade", "head"], ["check"]]:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", *arguments], cwd=service, env=env, capture_output=True, text=True
        )
        assert result.returncode == 0, result.stderr + result.stdout
    with sqlite3.connect(database) as db:
        sql = db.execute("SELECT sql FROM sqlite_master WHERE name='edits'").fetchone()[0]
        assert "ck_edit_status" in sql and "ck_edit_version" in sql
        assert db.execute("SELECT id FROM workspace_lock").fetchone()[0] == 1
        assert "deleted" in [row[1] for row in db.execute("PRAGMA table_info(threads)")]
