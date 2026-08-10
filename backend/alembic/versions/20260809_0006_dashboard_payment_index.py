"""dashboard payment index

Revision ID: 20260809_0006
Revises: 20260809_0005
Create Date: 2026-08-09
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260809_0006"
down_revision: str | None = "20260809_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_payments_business_id", table_name="payments")
    op.create_index(
        "ix_payments_business_status_paid_at",
        "payments",
        ["business_id", "status", "paid_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_payments_business_status_paid_at", table_name="payments")
    op.create_index("ix_payments_business_id", "payments", ["business_id"])
