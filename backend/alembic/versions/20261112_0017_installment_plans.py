"""Add business installment policy and order payment plans.

Revision ID: 20261112_0017
Revises: 20261112_0016
Create Date: 2026-11-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261112_0017"
down_revision: str | None = "20261112_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("installment_plans_required", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_table(
        "payment_installment_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("advance_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("advance_due_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "advance_amount IS NULL OR advance_amount >= 0",
            name="advance_amount_nonnegative",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", name="uq_payment_installment_plans_order_id"),
    )
    op.create_index(
        "ix_payment_installment_plans_business_id", "payment_installment_plans", ["business_id"]
    )
    op.create_table(
        "payment_installments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name="amount_positive"),
        sa.CheckConstraint("position > 0", name="position_positive"),
        sa.ForeignKeyConstraint(["plan_id"], ["payment_installment_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payment_installments_due_date", "payment_installments", ["due_date"])
    op.create_table(
        "payment_allocations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("payment_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("installment_id", sa.Uuid(), nullable=True),
        sa.Column("is_advance", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_id"], ["payment_installment_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["installment_id"], ["payment_installments.id"], ondelete="CASCADE"),
        sa.CheckConstraint("amount > 0", name="amount_positive"),
        sa.CheckConstraint(
            "(installment_id IS NOT NULL AND is_advance = false) OR "
            "(installment_id IS NULL AND is_advance = true)",
            name="target_exactly_one",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payment_allocations_payment_id", "payment_allocations", ["payment_id"])


def downgrade() -> None:
    op.drop_index("ix_payment_allocations_payment_id", table_name="payment_allocations")
    op.drop_table("payment_allocations")
    op.drop_index("ix_payment_installments_due_date", table_name="payment_installments")
    op.drop_table("payment_installments")
    op.drop_index("ix_payment_installment_plans_business_id", table_name="payment_installment_plans")
    op.drop_table("payment_installment_plans")
    op.drop_column("businesses", "installment_plans_required")
