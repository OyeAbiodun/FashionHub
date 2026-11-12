"""Add platform and tenant admin role labels.

Revision ID: 20261112_0016
Revises: 20261112_0015
Create Date: 2026-11-12
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261112_0016"
down_revision: str | None = "20261112_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The enum labels are required by the current UserRole model and API schemas.
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'BUSINESS_ADMIN'")
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPER_ADMIN'")


def downgrade() -> None:
    # PostgreSQL cannot remove enum labels without rebuilding the type. Keep the
    # extra labels on downgrade; this is a safe, non-destructive schema rollback.
    pass
