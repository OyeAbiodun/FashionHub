"""Add configurable platform support reach details."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261117_0034"
down_revision: str | None = "20261117_0033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "platform_email_configurations", sa.Column("support_email", sa.String(320), nullable=True)
    )
    op.add_column(
        "platform_email_configurations", sa.Column("support_whatsapp", sa.String(32), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("platform_email_configurations", "support_whatsapp")
    op.drop_column("platform_email_configurations", "support_email")
