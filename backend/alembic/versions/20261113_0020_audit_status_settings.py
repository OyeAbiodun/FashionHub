"""Add business audit history and configurable order status metadata."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261113_0020"
down_revision: str | None = "20261112_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        table: {column["name"] for column in inspector.get_columns(table)}
        for table in ("orders", "businesses")
    }
    if "reference_image" not in columns["orders"]:
        op.add_column("orders", sa.Column("reference_image", sa.Text(), nullable=True))
    if "order_status_configuration" not in columns["businesses"]:
        op.add_column(
            "businesses",
            sa.Column("order_status_configuration", sa.JSON(), nullable=False, server_default="{}"),
        )
    if "audit_configuration" not in columns["businesses"]:
        op.add_column(
            "businesses",
            sa.Column(
                "audit_configuration",
                sa.JSON(),
                nullable=False,
                server_default='{"enabled": true, "capture_ip": false, "capture_device": false}',
            ),
        )

    if "business_audit_logs" not in inspector.get_table_names():
        op.create_table(
            "business_audit_logs",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("business_id", sa.Uuid(), nullable=False),
            sa.Column("actor_id", sa.Uuid(), nullable=False),
            sa.Column("action", sa.String(length=100), nullable=False),
            sa.Column("summary", sa.String(length=500), nullable=False),
            sa.Column("details", sa.JSON(), nullable=False),
            sa.Column("source_ip", sa.String(length=64), nullable=True),
            sa.Column("user_agent", sa.String(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
        )
    inspector = sa.inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("business_audit_logs")}
    if "ix_business_audit_logs_business_created" not in indexes:
        op.create_index(
            "ix_business_audit_logs_business_created",
            "business_audit_logs",
            ["business_id", "created_at"],
        )
    if "ix_business_audit_logs_actor" not in indexes:
        op.create_index("ix_business_audit_logs_actor", "business_audit_logs", ["actor_id"])


def downgrade() -> None:
    op.drop_column("orders", "reference_image")
    op.drop_index("ix_business_audit_logs_actor", table_name="business_audit_logs")
    op.drop_index("ix_business_audit_logs_business_created", table_name="business_audit_logs")
    op.drop_table("business_audit_logs")
    op.drop_column("businesses", "audit_configuration")
    op.drop_column("businesses", "order_status_configuration")
