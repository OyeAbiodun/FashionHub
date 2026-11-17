"""Add tenant-scoped customer communication templates, history, and attempts."""

from collections.abc import Sequence

from alembic import op
from app.models.base import Base
from app.models.communication import Communication, CommunicationAttempt, MessageTemplate

revision: str = "20261113_0022"
down_revision: str | None = "20261113_0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = [MessageTemplate.__table__, Communication.__table__, CommunicationAttempt.__table__]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=TABLES, checkfirst=True)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=list(reversed(TABLES)), checkfirst=True)
