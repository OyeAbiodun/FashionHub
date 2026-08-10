"""measurement vault

Revision ID: 20260808_0003
Revises: 20260808_0002
Create Date: 2026-08-08
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.measurement_defaults import SYSTEM_MEASUREMENT_TEMPLATES, normalize_field_key

revision: str = "20260808_0003"
down_revision: str | None = "20260808_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TEMPLATE_NAMESPACE = uuid.UUID("807f3c68-40b7-4d91-9268-6b05c6d83dc3")


def template_id(name: str) -> str:
    return str(uuid.uuid5(TEMPLATE_NAMESPACE, f"template:{name}"))


def field_id(template_name: str, field_name: str) -> str:
    return str(uuid.uuid5(TEMPLATE_NAMESPACE, f"field:{template_name}:{field_name}"))


def upgrade() -> None:
    measurement_unit = sa.Enum("INCH", "CM", name="measurement_unit")

    op.create_table(
        "measurement_templates",
        sa.Column("business_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("garment_type", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system_template", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_measurement_templates_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_measurement_templates")),
    )
    op.create_index(
        "ix_measurement_templates_business_id",
        "measurement_templates",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        "ix_measurement_templates_business_id_is_active",
        "measurement_templates",
        ["business_id", "is_active"],
        unique=False,
    )

    op.create_table(
        "measurement_template_fields",
        sa.Column("template_id", sa.Uuid(), nullable=False),
        sa.Column("field_name", sa.String(length=120), nullable=False),
        sa.Column("field_key", sa.String(length=120), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_required", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("unit_hint", sa.String(length=40), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["measurement_templates.id"],
            name=op.f("fk_measurement_template_fields_template_id_measurement_templates"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_measurement_template_fields")),
    )
    op.create_index(
        "ix_measurement_template_fields_template_id",
        "measurement_template_fields",
        ["template_id"],
        unique=False,
    )
    op.create_index(
        "ix_measurement_template_fields_template_id_position",
        "measurement_template_fields",
        ["template_id", "position"],
        unique=False,
    )

    op.create_table(
        "measurement_profiles",
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("template_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("garment_type", sa.String(length=80), nullable=False),
        sa.Column("unit", measurement_unit, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("recorded_by", sa.Uuid(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_measurement_profiles_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name=op.f("fk_measurement_profiles_customer_id_customers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by"],
            ["users.id"],
            name=op.f("fk_measurement_profiles_recorded_by_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["measurement_templates.id"],
            name=op.f("fk_measurement_profiles_template_id_measurement_templates"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_measurement_profiles")),
    )
    op.create_index("ix_measurement_profiles_business_id", "measurement_profiles", ["business_id"])
    op.create_index("ix_measurement_profiles_customer_id", "measurement_profiles", ["customer_id"])
    op.create_index(
        "ix_measurement_profiles_business_id_archived_at",
        "measurement_profiles",
        ["business_id", "archived_at"],
    )
    op.create_index(
        "ix_measurement_profiles_customer_id_recorded_at",
        "measurement_profiles",
        ["customer_id", "recorded_at"],
    )

    op.create_table(
        "measurement_values",
        sa.Column("measurement_profile_id", sa.Uuid(), nullable=False),
        sa.Column("field_name", sa.String(length=120), nullable=False),
        sa.Column("field_key", sa.String(length=120), nullable=False),
        sa.Column("value", sa.Numeric(8, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["measurement_profile_id"],
            ["measurement_profiles.id"],
            name=op.f("fk_measurement_values_measurement_profile_id_measurement_profiles"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_measurement_values")),
    )
    op.create_index(
        "ix_measurement_values_measurement_profile_id",
        "measurement_values",
        ["measurement_profile_id"],
    )
    op.create_index(
        "ix_measurement_values_measurement_profile_id_position",
        "measurement_values",
        ["measurement_profile_id", "position"],
    )

    templates_table = sa.table(
        "measurement_templates",
        sa.column("id", sa.Uuid()),
        sa.column("business_id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("garment_type", sa.String()),
        sa.column("description", sa.Text()),
        sa.column("is_system_template", sa.Boolean()),
        sa.column("is_active", sa.Boolean()),
    )
    fields_table = sa.table(
        "measurement_template_fields",
        sa.column("id", sa.Uuid()),
        sa.column("template_id", sa.Uuid()),
        sa.column("field_name", sa.String()),
        sa.column("field_key", sa.String()),
        sa.column("position", sa.Integer()),
        sa.column("is_required", sa.Boolean()),
        sa.column("unit_hint", sa.String()),
    )
    op.bulk_insert(
        templates_table,
        [
            {
                "id": template_id(name),
                "business_id": None,
                "name": name,
                "garment_type": garment_type,
                "description": "System default measurement template.",
                "is_system_template": True,
                "is_active": True,
            }
            for name, garment_type, _fields in SYSTEM_MEASUREMENT_TEMPLATES
        ],
    )
    op.bulk_insert(
        fields_table,
        [
            {
                "id": field_id(name, field_name),
                "template_id": template_id(name),
                "field_name": field_name,
                "field_key": normalize_field_key(field_name),
                "position": position,
                "is_required": True,
                "unit_hint": "inches",
            }
            for name, _garment_type, fields in SYSTEM_MEASUREMENT_TEMPLATES
            for position, field_name in enumerate(fields, start=1)
        ],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_measurement_values_measurement_profile_id_position", table_name="measurement_values"
    )
    op.drop_index("ix_measurement_values_measurement_profile_id", table_name="measurement_values")
    op.drop_table("measurement_values")
    op.drop_index(
        "ix_measurement_profiles_customer_id_recorded_at", table_name="measurement_profiles"
    )
    op.drop_index(
        "ix_measurement_profiles_business_id_archived_at", table_name="measurement_profiles"
    )
    op.drop_index("ix_measurement_profiles_customer_id", table_name="measurement_profiles")
    op.drop_index("ix_measurement_profiles_business_id", table_name="measurement_profiles")
    op.drop_table("measurement_profiles")
    op.drop_index(
        "ix_measurement_template_fields_template_id_position",
        table_name="measurement_template_fields",
    )
    op.drop_index(
        "ix_measurement_template_fields_template_id", table_name="measurement_template_fields"
    )
    op.drop_table("measurement_template_fields")
    op.drop_index(
        "ix_measurement_templates_business_id_is_active", table_name="measurement_templates"
    )
    op.drop_index("ix_measurement_templates_business_id", table_name="measurement_templates")
    op.drop_table("measurement_templates")
    sa.Enum(name="measurement_unit").drop(op.get_bind(), checkfirst=True)
