"""pricing payments and invoices

Revision ID: 20260809_0005
Revises: 20260808_0004
Create Date: 2026-08-09

Existing order items are backfilled with unit_price 0.00 and existing orders with
discount_amount 0.00 so development data remains readable after the upgrade.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260809_0005"
down_revision: str | None = "20260808_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    payment_method = sa.Enum("CASH", "TRANSFER", "CARD", "POS", "OTHER", name="payment_method")
    payment_status = sa.Enum("PENDING", "SUCCESSFUL", "FAILED", "REFUNDED", name="payment_status")
    invoice_status = sa.Enum(
        "DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED", name="invoice_status"
    )

    op.add_column(
        "order_items",
        sa.Column("unit_price", sa.Numeric(12, 2), server_default="0.00", nullable=False),
    )
    op.add_column(
        "orders",
        sa.Column("discount_amount", sa.Numeric(12, 2), server_default="0.00", nullable=False),
    )
    op.create_check_constraint("unit_price_nonnegative", "order_items", "unit_price >= 0")
    op.create_check_constraint("discount_nonnegative", "orders", "discount_amount >= 0")

    op.create_table(
        "invoice_counters",
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("next_number", sa.Integer(), server_default="1", nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("business_id"),
    )
    op.create_table(
        "payments",
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", payment_method, nullable=False),
        sa.Column("status", payment_status, nullable=False),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("received_by", sa.Uuid(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name="amount_positive"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["received_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payments_business_id", "payments", ["business_id"])
    op.create_index("ix_payments_order_id_paid_at", "payments", ["order_id", "paid_at"])
    op.create_index("ix_payments_customer_id_paid_at", "payments", ["customer_id", "paid_at"])

    op.create_table(
        "invoices",
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_number", sa.String(40), nullable=False),
        sa.Column("status", invoice_status, nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", name="uq_invoices_order_id"),
        sa.UniqueConstraint("business_id", "invoice_number", name="uq_invoices_business_number"),
    )
    op.create_index("ix_invoices_business_id", "invoices", ["business_id"])
    op.create_index("ix_invoices_customer_id", "invoices", ["customer_id"])


def downgrade() -> None:
    op.drop_index("ix_invoices_customer_id", table_name="invoices")
    op.drop_index("ix_invoices_business_id", table_name="invoices")
    op.drop_table("invoices")
    op.drop_index("ix_payments_customer_id_paid_at", table_name="payments")
    op.drop_index("ix_payments_order_id_paid_at", table_name="payments")
    op.drop_index("ix_payments_business_id", table_name="payments")
    op.drop_table("payments")
    op.drop_table("invoice_counters")
    op.drop_constraint("discount_nonnegative", "orders", type_="check")
    op.drop_constraint("unit_price_nonnegative", "order_items", type_="check")
    op.drop_column("orders", "discount_amount")
    op.drop_column("order_items", "unit_price")
    sa.Enum(name="invoice_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="payment_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="payment_method").drop(op.get_bind(), checkfirst=True)
