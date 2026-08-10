"""business invoice settings

Revision ID: 20260809_0007
Revises: 20260809_0006
Create Date: 2026-08-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260809_0007"
down_revision: str | None = "20260809_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("businesses", sa.Column("invoice_notes", sa.Text(), nullable=True))
    op.add_column("businesses", sa.Column("invoice_footer", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("businesses", "invoice_footer")
    op.drop_column("businesses", "invoice_notes")
