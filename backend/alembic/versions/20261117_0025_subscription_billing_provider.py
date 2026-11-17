"""Add platform billing provider selection."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261117_0025"
down_revision: str | None = "20261117_0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "platform_subscription_configurations",
        sa.Column(
            "billing_provider",
            sa.String(length=24),
            nullable=False,
            server_default="MANUAL",
        ),
    )
    op.add_column(
        "platform_subscription_configurations",
        sa.Column("billing_mode", sa.String(length=12), nullable=False, server_default="TEST"),
    )


def downgrade() -> None:
    op.drop_column("platform_subscription_configurations", "billing_mode")
    op.drop_column("platform_subscription_configurations", "billing_provider")
