"""add host finalmask

Revision ID: d4e5f607a8b9
Revises: c8d2e4f607a1
Create Date: 2026-11-04 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d4e5f607a8b9"
down_revision = "c8d2e4f607a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("hosts") as batch_op:
        batch_op.add_column(sa.Column("finalmask", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("hosts") as batch_op:
        batch_op.drop_column("finalmask")
