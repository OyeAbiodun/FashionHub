"""Create transitional business membership records and backfill current users."""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261117_0029"
down_revision: str | None = "20261117_0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "business_memberships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False),
        sa.Column("permissions", sa.JSON(), nullable=True),
        sa.Column("custom_role_id", sa.Uuid(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["custom_role_id"], ["roles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_memberships")),
        sa.UniqueConstraint("business_id", "user_id", name="uq_business_membership_business_user"),
    )
    op.create_index(
        op.f("ix_business_memberships_business_id"), "business_memberships", ["business_id"]
    )
    op.create_index(op.f("ix_business_memberships_user_id"), "business_memberships", ["user_id"])
    op.create_index(
        op.f("ix_business_memberships_custom_role_id"), "business_memberships", ["custom_role_id"]
    )

    users = sa.table(
        "users",
        sa.column("id", sa.Uuid()),
        sa.column("business_id", sa.Uuid()),
        sa.column("role", sa.String()),
        sa.column("permissions", sa.JSON()),
        sa.column("custom_role_id", sa.Uuid()),
        sa.column("is_active", sa.Boolean()),
    )
    memberships = sa.table(
        "business_memberships",
        sa.column("id", sa.Uuid()),
        sa.column("business_id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("role", sa.String()),
        sa.column("permissions", sa.JSON()),
        sa.column("custom_role_id", sa.Uuid()),
        sa.column("is_active", sa.Boolean()),
    )
    connection = op.get_bind()
    for user in connection.execute(
        sa.select(
            users.c.id,
            users.c.business_id,
            users.c.role,
            users.c.permissions,
            users.c.custom_role_id,
            users.c.is_active,
        ).where(
            users.c.business_id.is_not(None),
            sa.cast(users.c.role, sa.String()) != "SUPER_ADMIN",
        )
    ).mappings():
        connection.execute(
            memberships.insert().values(
                id=uuid.uuid4(),
                business_id=user["business_id"],
                user_id=user["id"],
                role=str(user["role"]),
                permissions=user["permissions"],
                custom_role_id=user["custom_role_id"],
                is_active=user["is_active"],
            )
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_business_memberships_custom_role_id"), table_name="business_memberships")
    op.drop_index(op.f("ix_business_memberships_user_id"), table_name="business_memberships")
    op.drop_index(op.f("ix_business_memberships_business_id"), table_name="business_memberships")
    op.drop_table("business_memberships")
