"""Store encrypted platform billing provider credentials."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261117_0026"
down_revision: str | None = "20261117_0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "platform_subscription_configurations",
        sa.Column("billing_secret_encrypted", sa.Text(), nullable=True),
    )
    op.add_column(
        "platform_subscription_configurations",
        sa.Column("billing_secret_tested_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "platform_subscription_configurations",
        sa.Column("billing_secret_tested_provider", sa.String(length=24), nullable=True),
    )
    op.add_column(
        "platform_subscription_configurations",
        sa.Column("billing_secret_tested_mode", sa.String(length=12), nullable=True),
    )
    op.add_column(
        "platform_subscription_configurations",
        sa.Column("billing_secret_tested_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("platform_subscription_configurations", "billing_secret_encrypted")
    op.drop_column("platform_subscription_configurations", "billing_secret_tested_at")
    op.drop_column("platform_subscription_configurations", "billing_secret_tested_mode")
    op.drop_column("platform_subscription_configurations", "billing_secret_tested_provider")
    op.drop_column("platform_subscription_configurations", "billing_secret_tested_hash")
