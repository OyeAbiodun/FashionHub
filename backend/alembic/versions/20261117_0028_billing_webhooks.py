"""Add encrypted webhook secret and idempotent billing event records."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261117_0028"
down_revision: str | None = "20261117_0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "platform_subscription_configurations",
        sa.Column("billing_webhook_secret_encrypted", sa.Text(), nullable=True),
    )
    op.create_table(
        "billing_webhook_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("provider", sa.String(length=24), nullable=False),
        sa.Column("event_id", sa.String(length=160), nullable=False),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_billing_webhook_events")),
        sa.UniqueConstraint("provider", "event_id", name="uq_billing_webhook_provider_event"),
    )


def downgrade() -> None:
    op.drop_table("billing_webhook_events")
    op.drop_column("platform_subscription_configurations", "billing_webhook_secret_encrypted")
