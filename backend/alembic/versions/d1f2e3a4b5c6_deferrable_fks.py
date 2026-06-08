"""make foreign keys deferrable (PostgreSQL)

Lets the seed loader bulk-insert ``seed.sql`` (which carries forward FK
references SQLite tolerates with FK enforcement off) under a **normal,
non-superuser** role: with every FK ``DEFERRABLE INITIALLY IMMEDIATE``, the seed
transaction issues ``SET CONSTRAINTS ALL DEFERRED`` so FK checks run at COMMIT
instead of per-row — no ``session_replication_role = replica`` (superuser) needed.

``INITIALLY IMMEDIATE`` keeps normal runtime behaviour identical (FKs checked
immediately by default); only the seed transaction defers. PostgreSQL-only —
SQLite does not enforce FKs by default, so this is a no-op there.

Revision ID: d1f2e3a4b5c6
Revises: d65d374b78c5
Create Date: 2026-06-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1f2e3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "d65d374b78c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _foreign_keys(bind) -> list[tuple[str, str]]:
    rows = bind.execute(
        sa.text(
            "SELECT conrelid::regclass::text AS tbl, conname "
            "FROM pg_constraint WHERE contype = 'f'"
        )
    ).fetchall()
    return [(r[0], r[1]) for r in rows]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for tbl, conname in _foreign_keys(bind):
        op.execute(
            f'ALTER TABLE {tbl} ALTER CONSTRAINT "{conname}" '
            f"DEFERRABLE INITIALLY IMMEDIATE"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for tbl, conname in _foreign_keys(bind):
        op.execute(
            f'ALTER TABLE {tbl} ALTER CONSTRAINT "{conname}" NOT DEFERRABLE'
        )
