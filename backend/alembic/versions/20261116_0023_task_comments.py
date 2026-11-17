"""Add tenant-scoped task comments."""

from collections.abc import Sequence

from alembic import op
from app.models.task import TaskComment

revision: str = "20261116_0023"
down_revision: str | None = "20261113_0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    TaskComment.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    TaskComment.__table__.drop(bind=op.get_bind(), checkfirst=True)
