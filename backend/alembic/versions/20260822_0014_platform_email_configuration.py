"""Add singleton platform SMTP configuration.

Revision ID: 20260822_0014
Revises: 20260820_0013
Create Date: 2026-08-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260822_0014"
down_revision: str | None = "20260820_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    provider = postgresql.ENUM(
        "GMAIL",
        "OUTLOOK",
        "YAHOO",
        "CUSTOM_SMTP",
        name="platform_email_provider",
        create_type=False,
    )
    security_mode = postgresql.ENUM(
        "STARTTLS", "TLS", "NONE", name="smtp_security_mode", create_type=False
    )
    provider.create(op.get_bind(), checkfirst=True)
    security_mode.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "platform_email_configurations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("config_key", sa.String(length=32), nullable=False),
        sa.Column("provider", provider, nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("smtp_host", sa.String(length=255), nullable=False),
        sa.Column("smtp_port", sa.Integer(), nullable=False),
        sa.Column("smtp_username", sa.String(length=320), nullable=True),
        sa.Column("smtp_password_encrypted", sa.String(length=2048), nullable=True),
        sa.Column("security_mode", security_mode, nullable=False),
        sa.Column("from_email", sa.String(length=320), nullable=False),
        sa.Column("from_name", sa.String(length=200), nullable=False),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_status", sa.String(length=20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("config_key"),
    )


def downgrade() -> None:
    op.drop_table("platform_email_configurations")
    security_mode = postgresql.ENUM(
        "STARTTLS", "TLS", "NONE", name="smtp_security_mode", create_type=False
    )
    provider = postgresql.ENUM(
        "GMAIL",
        "OUTLOOK",
        "YAHOO",
        "CUSTOM_SMTP",
        name="platform_email_provider",
        create_type=False,
    )
    security_mode.drop(op.get_bind(), checkfirst=True)
    provider.drop(op.get_bind(), checkfirst=True)
