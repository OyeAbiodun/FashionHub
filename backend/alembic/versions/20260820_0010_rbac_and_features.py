"""add rbac and business feature gating

Revision ID: 20260820_0010
Revises: 20260820_0009
Create Date: 2026-08-20
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260820_0010"
down_revision: str | None = "20260820_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_FEATURES_JSON = (
    '["customers", "measurements", "templates", "orders", "invoices", "reports", "team"]'
)


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column(
            "enabled_features",
            sa.JSON(),
            nullable=False,
            server_default=DEFAULT_FEATURES_JSON,
        ),
    )
    op.add_column(
        "businesses",
        sa.Column(
            "max_staff_users",
            sa.Integer(),
            nullable=False,
            server_default="10",
        ),
    )
    op.add_column(
        "businesses",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.add_column(
        "users",
        sa.Column("permissions", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "permissions")
    op.drop_column("businesses", "is_active")
    op.drop_column("businesses", "max_staff_users")
    op.drop_column("businesses", "enabled_features")
