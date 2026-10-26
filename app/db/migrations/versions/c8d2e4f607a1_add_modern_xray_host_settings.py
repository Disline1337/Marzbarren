"""add modern xray host settings

Revision ID: c8d2e4f607a1
Revises: b7c9e1f203a4
Create Date: 2026-10-14 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c8d2e4f607a1"
down_revision = "b7c9e1f203a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("hosts") as batch_op:
        batch_op.add_column(sa.Column("vless_encryption", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("xhttp_mode", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("xhttp_extra", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("hosts") as batch_op:
        batch_op.drop_column("xhttp_extra")
        batch_op.drop_column("xhttp_mode")
        batch_op.drop_column("vless_encryption")
