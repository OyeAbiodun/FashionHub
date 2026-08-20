"""editable measurement templates

Revision ID: 20260817_0008
Revises: 20260809_0007
Create Date: 2026-08-17
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260817_0008"
down_revision: str | None = "20260809_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    measurement_field_type = sa.Enum("NUMBER", name="measurement_field_type")
    measurement_field_type.create(op.get_bind(), checkfirst=True)

    op.add_column("measurement_template_fields", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "measurement_template_fields",
        sa.Column(
            "field_type",
            measurement_field_type,
            server_default="NUMBER",
            nullable=False,
        ),
    )
    op.add_column(
        "measurement_template_fields",
        sa.Column("default_value", sa.Numeric(8, 2), nullable=True),
    )
    op.add_column(
        "measurement_template_fields",
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )
    op.create_unique_constraint(
        "uq_measurement_template_fields_key",
        "measurement_template_fields",
        ["template_id", "field_key"],
    )

    businesses = sa.table("businesses", sa.column("id", sa.Uuid()))
    templates = sa.table(
        "measurement_templates",
        sa.column("id", sa.Uuid()),
        sa.column("business_id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("garment_type", sa.String()),
        sa.column("description", sa.Text()),
        sa.column("is_system_template", sa.Boolean()),
        sa.column("is_active", sa.Boolean()),
    )
    fields = sa.table(
        "measurement_template_fields",
        sa.column("id", sa.Uuid()),
        sa.column("template_id", sa.Uuid()),
        sa.column("field_name", sa.String()),
        sa.column("field_key", sa.String()),
        sa.column("description", sa.Text()),
        sa.column("field_type", measurement_field_type),
        sa.column("position", sa.Integer()),
        sa.column("is_required", sa.Boolean()),
        sa.column("unit_hint", sa.String()),
        sa.column("default_value", sa.Numeric(8, 2)),
        sa.column("is_active", sa.Boolean()),
    )

    connection = op.get_bind()
    business_rows = connection.execute(sa.select(businesses.c.id)).all()
    system_templates = connection.execute(
        sa.select(
            templates.c.id,
            templates.c.name,
            templates.c.garment_type,
            templates.c.description,
            templates.c.is_active,
        ).where(templates.c.business_id.is_(None), templates.c.is_system_template.is_(True))
    ).all()

    for business_row in business_rows:
        business_id = business_row.id
        for template_row in system_templates:
            existing = connection.execute(
                sa.select(templates.c.id).where(
                    templates.c.business_id == business_id,
                    templates.c.name == template_row.name,
                    templates.c.garment_type == template_row.garment_type,
                )
            ).first()
            if existing is not None:
                continue

            new_template_id = uuid.uuid4()
            connection.execute(
                templates.insert().values(
                    id=new_template_id,
                    business_id=business_id,
                    name=template_row.name,
                    garment_type=template_row.garment_type,
                    description=template_row.description,
                    is_system_template=True,
                    is_active=template_row.is_active,
                )
            )
            template_fields = connection.execute(
                sa.select(
                    fields.c.field_name,
                    fields.c.field_key,
                    fields.c.position,
                    fields.c.is_required,
                    fields.c.unit_hint,
                )
                .where(fields.c.template_id == template_row.id)
                .order_by(fields.c.position.asc())
            ).all()
            for field_row in template_fields:
                connection.execute(
                    fields.insert().values(
                        id=uuid.uuid4(),
                        template_id=new_template_id,
                        field_name=field_row.field_name,
                        field_key=field_row.field_key,
                        description=None,
                        field_type="NUMBER",
                        position=field_row.position,
                        is_required=field_row.is_required,
                        unit_hint=field_row.unit_hint,
                        default_value=None,
                        is_active=True,
                    )
                )


def downgrade() -> None:
    op.drop_constraint(
        "uq_measurement_template_fields_key",
        "measurement_template_fields",
        type_="unique",
    )
    op.drop_column("measurement_template_fields", "is_active")
    op.drop_column("measurement_template_fields", "default_value")
    op.drop_column("measurement_template_fields", "field_type")
    op.drop_column("measurement_template_fields", "description")
    sa.Enum(name="measurement_field_type").drop(op.get_bind(), checkfirst=True)
