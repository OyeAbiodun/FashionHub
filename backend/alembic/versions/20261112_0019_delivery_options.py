"""Add business delivery feature controls, charges, and proof media.

Revision ID: 20261112_0019
Revises: 20261112_0018
Create Date: 2026-11-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261112_0019"
down_revision: str | None = "20261112_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("delivery_charges_enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "businesses",
        sa.Column("proof_of_delivery_enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "orders",
        sa.Column("delivery_charge", sa.Numeric(12, 2), server_default="0.00", nullable=False),
    )
    op.create_check_constraint(
        "delivery_charge_nonnegative", "orders", "delivery_charge >= 0"
    )
    op.add_column(
        "order_fulfillments",
        sa.Column("proof_of_delivery_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("order_fulfillments", "proof_of_delivery_url")
    op.drop_constraint("delivery_charge_nonnegative", "orders", type_="check")
    op.drop_column("orders", "delivery_charge")
    op.drop_column("businesses", "proof_of_delivery_enabled")
    op.drop_column("businesses", "delivery_charges_enabled")
