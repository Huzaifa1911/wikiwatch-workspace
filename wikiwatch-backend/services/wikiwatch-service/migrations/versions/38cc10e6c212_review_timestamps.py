"""Add review timestamps. Keep migration types independent of application code."""

import sqlalchemy as sa
from alembic import op

revision = "38cc10e6c212"
down_revision = "ab1600c59ce4"
branch_labels = None
depends_on = None


def upgrade():
    for name in ["claimed_at", "reviewed_at", "updated_at"]:
        op.add_column("edits", sa.Column(name, sa.DateTime(timezone=True), nullable=True))
    op.execute(sa.text("UPDATE edits SET updated_at = admitted_at"))
    with op.batch_alter_table("edits") as batch:
        batch.alter_column("updated_at", existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade():
    with op.batch_alter_table("edits") as batch:
        for name in ["updated_at", "reviewed_at", "claimed_at"]:
            batch.drop_column(name)
