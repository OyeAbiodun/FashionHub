"""Add custom roles and task management tables.

Revision ID: 20260820_0011
Revises: 20260820_0010
Create Date: 2026-08-20 08:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260820_0011"
down_revision: str | None = "20260820_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create roles table
    op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("permissions", sa.JSON(), nullable=True),
        sa.Column("is_system_role", sa.Boolean(), nullable=False, server_default="false"),
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
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_roles_business_id"), "roles", ["business_id"], unique=False)

    # Add custom_role_id to users
    op.add_column("users", sa.Column("custom_role_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_users_custom_role_id_roles",
        "users",
        "roles",
        ["custom_role_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_users_custom_role_id"), "users", ["custom_role_id"], unique=False)

    # Create tasks table
    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.Column("customer_id", sa.Uuid(), nullable=True),
        sa.Column("assigned_to_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", name="taskstatus"),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column(
            "priority",
            sa.Enum("LOW", "MEDIUM", "HIGH", "URGENT", name="taskpriority"),
            nullable=False,
            server_default="MEDIUM",
        ),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tasks_business_id"), "tasks", ["business_id"], unique=False)
    op.create_index(op.f("ix_tasks_order_id"), "tasks", ["order_id"], unique=False)
    op.create_index(op.f("ix_tasks_customer_id"), "tasks", ["customer_id"], unique=False)
    op.create_index(op.f("ix_tasks_assigned_to_id"), "tasks", ["assigned_to_id"], unique=False)
    op.create_index(op.f("ix_tasks_created_by_id"), "tasks", ["created_by_id"], unique=False)
    op.create_index(op.f("ix_tasks_status"), "tasks", ["status"], unique=False)
    op.create_index(op.f("ix_tasks_priority"), "tasks", ["priority"], unique=False)
    op.create_index(op.f("ix_tasks_due_at"), "tasks", ["due_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tasks_due_at"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_priority"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_status"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_created_by_id"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_assigned_to_id"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_customer_id"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_order_id"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_business_id"), table_name="tasks")
    op.drop_table("tasks")

    op.drop_index(op.f("ix_users_custom_role_id"), table_name="users")
    op.drop_constraint("fk_users_custom_role_id_roles", "users", type_="foreignkey")
    op.drop_column("users", "custom_role_id")

    op.drop_index(op.f("ix_roles_business_id"), table_name="roles")
    op.drop_table("roles")
