"""create customers

Revision ID: 20260808_0002
Revises: 20260808_0001
Create Date: 2026-08-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260808_0002"
down_revision: str | None = "20260808_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("phone_normalized", sa.String(length=40), nullable=False),
        sa.Column("alternate_phone", sa.String(length=40), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("gender", sa.String(length=40), nullable=True),
        sa.Column("birthday", sa.Date(), nullable=True),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_customers_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customers")),
        sa.UniqueConstraint(
            "business_id",
            "phone_normalized",
            name="uq_customers_business_id_phone_normalized",
        ),
    )
    op.create_index("ix_customers_business_id", "customers", ["business_id"], unique=False)
    op.create_index(
        "ix_customers_business_id_archived_at",
        "customers",
        ["business_id", "archived_at"],
        unique=False,
    )
    op.create_index(
        "ix_customers_business_id_first_name",
        "customers",
        ["business_id", "first_name"],
        unique=False,
    )
    op.create_index(
        "ix_customers_business_id_phone_normalized",
        "customers",
        ["business_id", "phone_normalized"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_customers_business_id_phone_normalized", table_name="customers")
    op.drop_index("ix_customers_business_id_first_name", table_name="customers")
    op.drop_index("ix_customers_business_id_archived_at", table_name="customers")
    op.drop_index("ix_customers_business_id", table_name="customers")
    op.drop_table("customers")
