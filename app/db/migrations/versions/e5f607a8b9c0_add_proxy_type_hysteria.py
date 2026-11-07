"""add proxy type hysteria

Revision ID: e5f607a8b9c0
Revises: d4e5f607a8b9
Create Date: 2026-04-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e5f607a8b9c0"
down_revision = "d4e5f607a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "mysql":
        op.execute(
            "ALTER TABLE proxies MODIFY type ENUM('vmess','vless','trojan','shadowsocks','hysteria') NOT NULL"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "mysql":
        return
    count = bind.execute(sa.text("SELECT COUNT(*) FROM proxies WHERE type = 'hysteria'")).scalar()
    if count:
        raise RuntimeError("cannot drop hysteria proxy type while rows exist")
    op.execute(
        "ALTER TABLE proxies MODIFY type ENUM('vmess','vless','trojan','shadowsocks') NOT NULL"
    )
