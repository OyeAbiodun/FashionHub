"""Add business subscription payment lifecycle records."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261117_0027"
down_revision: str | None = "20261117_0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "business_subscriptions",
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.String(length=64), nullable=False),
        sa.Column("plan_name", sa.String(length=100), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("provider", sa.String(length=24), nullable=False),
        sa.Column("billing_mode", sa.String(length=12), nullable=False, server_default="TEST"),
        sa.Column("provider_reference", sa.String(length=120), nullable=False),
        sa.Column("provider_transaction_id", sa.String(length=120), nullable=True),
        sa.Column("checkout_url", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_subscriptions")),
        sa.UniqueConstraint("provider_reference", name="uq_business_subscription_reference"),
    )
    op.create_index("ix_business_subscriptions_business_id", "business_subscriptions", ["business_id"])


def downgrade() -> None:
    op.drop_index("ix_business_subscriptions_business_id", table_name="business_subscriptions")
    op.drop_table("business_subscriptions")
