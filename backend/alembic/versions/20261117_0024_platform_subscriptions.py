"""Add platform-controlled subscription plan selection."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261117_0024"
down_revision: str | None = "20261116_0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("subscription_plan_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "businesses",
        sa.Column("subscription_selected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "platform_subscription_configurations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("plans", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_platform_subscription_configurations")),
    )


def downgrade() -> None:
    op.drop_table("platform_subscription_configurations")
    op.drop_column("businesses", "subscription_selected_at")
    op.drop_column("businesses", "subscription_plan_id")
