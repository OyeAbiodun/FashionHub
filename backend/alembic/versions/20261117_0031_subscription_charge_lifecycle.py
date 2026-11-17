"""Track subscription charges and scheduled Stripe cancellations."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261117_0031"
down_revision: str | None = "20261117_0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "business_subscriptions",
        sa.Column("cancel_at_period_end", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_table(
        "business_subscription_charges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("subscription_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=24), nullable=False),
        sa.Column("provider_charge_id", sa.String(length=160), nullable=False),
        sa.Column("reference", sa.String(length=120), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["subscription_id"], ["business_subscriptions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_subscription_charges")),
        sa.UniqueConstraint("provider", "provider_charge_id", name="uq_subscription_provider_charge"),
    )
    op.create_index(
        op.f("ix_business_subscription_charges_business_id"),
        "business_subscription_charges",
        ["business_id"],
    )
    op.create_index(
        op.f("ix_business_subscription_charges_subscription_id"),
        "business_subscription_charges",
        ["subscription_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_business_subscription_charges_subscription_id"),
        table_name="business_subscription_charges",
    )
    op.drop_index(
        op.f("ix_business_subscription_charges_business_id"),
        table_name="business_subscription_charges",
    )
    op.drop_table("business_subscription_charges")
    op.drop_column("business_subscriptions", "cancel_at_period_end")
