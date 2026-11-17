"""Store encrypted gateway credentials by provider and environment."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261117_0033"
down_revision: str | None = "20261117_0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "platform_subscription_configurations",
        sa.Column("provider_credentials", sa.JSON(), nullable=False, server_default="{}"),
    )
    table = sa.table(
        "platform_subscription_configurations",
        sa.column("id", sa.Integer),
        sa.column("billing_provider", sa.String),
        sa.column("billing_mode", sa.String),
        sa.column("billing_secret_encrypted", sa.Text),
        sa.column("billing_webhook_secret_encrypted", sa.Text),
        sa.column("billing_secret_tested_hash", sa.String),
        sa.column("billing_secret_tested_provider", sa.String),
        sa.column("billing_secret_tested_mode", sa.String),
        sa.column("billing_secret_tested_at", sa.DateTime(timezone=True)),
        sa.column("provider_credentials", sa.JSON),
    )
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(
            table.c.id,
            table.c.billing_provider,
            table.c.billing_mode,
            table.c.billing_secret_encrypted,
            table.c.billing_webhook_secret_encrypted,
            table.c.billing_secret_tested_hash,
            table.c.billing_secret_tested_provider,
            table.c.billing_secret_tested_mode,
            table.c.billing_secret_tested_at,
        )
    ).mappings()
    for row in rows:
        if not row["billing_secret_encrypted"] and not row["billing_webhook_secret_encrypted"]:
            continue
        provider = row["billing_provider"]
        mode = row["billing_mode"]
        entry = {
            "secret_encrypted": row["billing_secret_encrypted"],
            "webhook_secret_encrypted": row["billing_webhook_secret_encrypted"],
            "secret_configured": bool(row["billing_secret_encrypted"]),
            "webhook_secret_configured": bool(row["billing_webhook_secret_encrypted"]),
        }
        if (
            row["billing_secret_tested_provider"] == provider
            and row["billing_secret_tested_mode"] == mode
        ):
            entry["tested_hash"] = row["billing_secret_tested_hash"]
            tested_at = row["billing_secret_tested_at"]
            entry["tested_at"] = (
                tested_at.isoformat()
                if hasattr(tested_at, "isoformat")
                else str(tested_at)
                if tested_at
                else None
            )
        connection.execute(
            table.update()
            .where(table.c.id == row["id"])
            .values(provider_credentials={provider: {mode: entry}})
        )


def downgrade() -> None:
    op.drop_column("platform_subscription_configurations", "provider_credentials")
