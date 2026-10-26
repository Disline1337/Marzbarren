"""add hwid device limit

Revision ID: a1b2c3d4e5f6
Revises: 2b231de97dc3
Create Date: 2026-03-24 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "2b231de97dc3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("hwid_device_limit", sa.Integer(), nullable=True),
    )
    op.create_table(
        "hwid_user_devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("hwid", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("platform", sa.String(length=64), nullable=True),
        sa.Column("os_version", sa.String(length=64), nullable=True),
        sa.Column("device_model", sa.String(length=128), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("request_ip", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("hwid", "user_id", name="uq_hwid_user"),
    )
    op.create_index(
        op.f("ix_hwid_user_devices_hwid"),
        "hwid_user_devices",
        ["hwid"],
        unique=False,
    )
    op.create_index(
        op.f("ix_hwid_user_devices_user_id"),
        "hwid_user_devices",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_hwid_user_devices_user_id"), table_name="hwid_user_devices")
    op.drop_index(op.f("ix_hwid_user_devices_hwid"), table_name="hwid_user_devices")
    op.drop_table("hwid_user_devices")
    op.drop_column("users", "hwid_device_limit")
