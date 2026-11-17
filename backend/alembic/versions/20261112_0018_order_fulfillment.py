"""Add order fulfillment selection and handoff history.

Revision ID: 20261112_0018
Revises: 20261112_0017
Create Date: 2026-11-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261112_0018"
down_revision: str | None = "20261112_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

fulfillment_method = postgresql.ENUM("PICKUP", "DELIVERY", name="fulfillment_method", create_type=False)
fulfillment_status = postgresql.ENUM(
    "PLANNED", "OUT_FOR_DELIVERY", "COMPLETED", name="fulfillment_status", create_type=False
)
fulfillment_event_type = postgresql.ENUM(
    "CONFIGURED", "UPDATED", "DISPATCHED", "HANDED_OFF",
    name="fulfillment_event_type", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    fulfillment_method.create(bind, checkfirst=True)
    fulfillment_status.create(bind, checkfirst=True)
    fulfillment_event_type.create(bind, checkfirst=True)
    op.create_table(
        "order_fulfillments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("method", fulfillment_method, nullable=False),
        sa.Column("status", fulfillment_status, nullable=False),
        sa.Column("recipient_name", sa.String(length=200), nullable=True),
        sa.Column("recipient_phone", sa.String(length=40), nullable=True),
        sa.Column("delivery_address", sa.Text(), nullable=True),
        sa.Column("delivery_instructions", sa.Text(), nullable=True),
        sa.Column("tracking_reference", sa.String(length=255), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", name="uq_order_fulfillments_order_id"),
    )
    op.create_index(
        "ix_order_fulfillments_business_status", "order_fulfillments", ["business_id", "status"]
    )
    op.create_table(
        "order_fulfillment_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("fulfillment_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", fulfillment_event_type, nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["fulfillment_id"], ["order_fulfillments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_order_fulfillment_events_fulfillment_occurred",
        "order_fulfillment_events",
        ["fulfillment_id", "occurred_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_order_fulfillment_events_fulfillment_occurred", table_name="order_fulfillment_events")
    op.drop_table("order_fulfillment_events")
    op.drop_index("ix_order_fulfillments_business_status", table_name="order_fulfillments")
    op.drop_table("order_fulfillments")
    fulfillment_event_type.drop(op.get_bind(), checkfirst=True)
    fulfillment_status.drop(op.get_bind(), checkfirst=True)
    fulfillment_method.drop(op.get_bind(), checkfirst=True)
