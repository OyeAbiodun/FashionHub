"""Add secure, expiring business team invitations."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261117_0030"
down_revision: str | None = "20261117_0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "business_invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("invited_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("role", sa.String(length=24), nullable=False),
        sa.Column("permissions", sa.JSON(), nullable=True),
        sa.Column("custom_role_id", sa.Uuid(), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["custom_role_id"], ["roles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_invitations")),
        sa.UniqueConstraint("token_hash", name="uq_business_invitation_token_hash"),
    )
    op.create_index(
        op.f("ix_business_invitations_business_id"), "business_invitations", ["business_id"]
    )
    op.create_index(
        op.f("ix_business_invitations_email"), "business_invitations", ["email"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_business_invitations_email"), table_name="business_invitations")
    op.drop_index(op.f("ix_business_invitations_business_id"), table_name="business_invitations")
    op.drop_table("business_invitations")
