"""Add privacy-preserving password-reset request throttling.

Revision ID: 20260820_0013
Revises: 20260820_0012
Create Date: 2026-08-20
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260820_0013"
down_revision: str | None = "20260820_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "password_reset_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("identity_hash", sa.String(length=64), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
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
    )
    op.create_index(
        "ix_password_reset_requests_identity_hash",
        "password_reset_requests",
        ["identity_hash"],
    )
    op.create_index(
        "ix_password_reset_requests_source_hash",
        "password_reset_requests",
        ["source_hash"],
    )
    op.create_index(
        "ix_password_reset_requests_requested_at",
        "password_reset_requests",
        ["requested_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_password_reset_requests_requested_at", table_name="password_reset_requests")
    op.drop_index("ix_password_reset_requests_source_hash", table_name="password_reset_requests")
    op.drop_index("ix_password_reset_requests_identity_hash", table_name="password_reset_requests")
    op.drop_table("password_reset_requests")
