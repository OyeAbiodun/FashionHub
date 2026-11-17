"""Add tenant-scoped inventory, suppliers, stock ledger, and order material usage."""

from collections.abc import Sequence

from alembic import op
from app.models.base import Base
from app.models.inventory import InventoryItem, OrderMaterialUsage, StockMovement, Supplier

revision: str = "20261113_0021"
down_revision: str | None = "20261113_0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = [
    Supplier.__table__,
    InventoryItem.__table__,
    OrderMaterialUsage.__table__,
    StockMovement.__table__,
]


def upgrade() -> None:
    # Startup create_all may already have materialized these tables in development deployments.
    Base.metadata.create_all(bind=op.get_bind(), tables=TABLES, checkfirst=True)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=list(reversed(TABLES)), checkfirst=True)
