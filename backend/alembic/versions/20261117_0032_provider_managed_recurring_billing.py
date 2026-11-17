"""Store gateway recurring plan and customer subscription references."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261117_0032"
down_revision: str | None = "20261117_0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "platform_subscription_configurations",
        sa.Column("provider_plan_codes", sa.JSON(), nullable=False, server_default="{}"),
    )
    op.add_column(
        "business_subscriptions",
        sa.Column("provider_subscription_id", sa.String(length=160), nullable=True),
    )
    op.add_column(
        "business_subscriptions",
        sa.Column("provider_subscription_token_encrypted", sa.Text(), nullable=True),
    )
    op.add_column(
        "business_subscriptions",
        sa.Column("provider_customer_email", sa.String(length=320), nullable=True),
    )
    op.create_index(
        "ix_business_subscriptions_provider_subscription_id",
        "business_subscriptions",
        ["provider", "provider_subscription_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_business_subscriptions_provider_subscription_id",
        table_name="business_subscriptions",
    )
    op.drop_column("business_subscriptions", "provider_customer_email")
    op.drop_column("business_subscriptions", "provider_subscription_token_encrypted")
    op.drop_column("business_subscriptions", "provider_subscription_id")
    op.drop_column("platform_subscription_configurations", "provider_plan_codes")
