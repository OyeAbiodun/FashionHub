import uuid
from decimal import Decimal

import pytest
from conftest import register_payload
from sqlalchemy import select

from app.core.measurement_defaults import normalize_field_key
from app.models.measurement import (
    MeasurementProfile,
    MeasurementTemplate,
    MeasurementTemplateField,
    MeasurementValue,
)


async def register_owner(client, email: str):
    response = await client.post("/api/v1/auth/register", json=register_payload(email))
    assert response.status_code == 201
    return dict(client.cookies), response.json()


def use_cookies(client, cookies: dict[str, str]) -> None:
    client.cookies.clear()
    for name, value in cookies.items():
        client.cookies.set(name, value)


async def create_customer(
    client,
    first_name: str = "Bisi",
    last_name: str | None = None,
    phone: str | None = None,
) -> dict:
    response = await client.post(
        "/api/v1/customers",
        json={
            "first_name": first_name,
            "last_name": last_name,
            "phone": phone or f"080{len(first_name)}1234567",
        },
    )
    assert response.status_code == 201
    return response.json()


async def senator_template(client) -> dict:
    templates = (await client.get("/api/v1/measurement-templates")).json()
    template_id = next(template["id"] for template in templates if template["name"] == "Senator")
    response = await client.get(f"/api/v1/measurement-templates/{template_id}")
    assert response.status_code == 200
    return response.json()


def profile_payload(template: dict, name: str = "Senator - Aug 2026") -> dict:
    return {
        "template_id": template["id"],
        "name": name,
        "garment_type": template["garment_type"],
        "unit": "INCH",
        "notes": "Initial fitting.",
        "values": [
            {
                "field_key": field["field_key"],
                "field_name": field["field_name"],
                "value": "42.50" if field["field_key"] == "chest" else "18.25",
                "position": field["position"],
            }
            for field in template["fields"]
        ],
    }


async def create_profile(
    client, customer_id: str, template: dict, name: str = "Senator - Aug 2026"
) -> dict:
    response = await client.post(
        f"/api/v1/customers/{customer_id}/measurements",
        json=profile_payload(template, name),
    )
    assert response.status_code == 201
    return response.json()


async def test_unauthenticated_template_access_returns_401(client):
    response = await client.get("/api/v1/measurement-templates")
    assert response.status_code == 401


async def test_unauthenticated_global_measurement_list_returns_401(client):
    response = await client.get("/api/v1/measurement-profiles")
    assert response.status_code == 401


async def test_global_measurement_list_returns_current_tenant_profiles(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client, "Amina", "Okafor", "0803 456 7890")
    template = await senator_template(client)
    profile = await create_profile(client, customer["id"], template, "August Fitting")

    response = await client.get("/api/v1/measurement-profiles")

    assert response.status_code == 200
    assert response.json()["items"][0]["profile_id"] == profile["id"]
    assert response.json()["items"][0]["customer_name"] == "Amina Okafor"


async def test_global_measurement_list_excludes_another_tenant_profile(client):
    first_cookies, _ = await register_owner(client, "one@example.com")
    first_customer = await create_customer(client, "Amina", phone="08030000001")
    first_template = await senator_template(client)
    first_profile = await create_profile(client, first_customer["id"], first_template, "Private")

    await register_owner(client, "two@example.com")
    second_customer = await create_customer(client, "Tola", phone="08030000002")
    second_template = await senator_template(client)
    second_profile = await create_profile(client, second_customer["id"], second_template, "Visible")
    items = (await client.get("/api/v1/measurement-profiles")).json()["items"]

    assert [item["profile_id"] for item in items] == [second_profile["id"]]
    assert first_profile["id"] not in {item["profile_id"] for item in items}
    use_cookies(client, first_cookies)


@pytest.mark.parametrize(
    "search_term",
    ["Amina", "Okafor", "08034567890", "August Fitting"],
    ids=["first-name", "last-name", "phone", "profile-name"],
)
async def test_global_measurement_search_matches_useful_fields(client, search_term):
    await register_owner(client, f"{search_term.replace(' ', '').lower()}@example.com")
    customer = await create_customer(client, "Amina", "Okafor", "0803 456 7890")
    template = await senator_template(client)
    profile = await create_profile(client, customer["id"], template, "August Fitting")

    response = await client.get("/api/v1/measurement-profiles", params={"search": search_term})

    assert [item["profile_id"] for item in response.json()["items"]] == [profile["id"]]


async def test_global_measurement_garment_type_filter_works(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    senator = await create_profile(client, customer["id"], template, "Senator Profile")
    agbada_payload = profile_payload(template, "Agbada Profile")
    agbada_payload["garment_type"] = "AGBADA"
    agbada = (
        await client.post(f"/api/v1/customers/{customer['id']}/measurements", json=agbada_payload)
    ).json()

    response = await client.get("/api/v1/measurement-profiles", params={"garment_type": "agbada"})

    assert [item["profile_id"] for item in response.json()["items"]] == [agbada["id"]]
    assert senator["id"] not in {item["profile_id"] for item in response.json()["items"]}


async def test_global_measurement_archived_filter_and_default_behavior(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    archived_profile = await create_profile(client, customer["id"], template)
    await client.post(f"/api/v1/measurement-profiles/{archived_profile['id']}/archive")

    active = await client.get("/api/v1/measurement-profiles")
    archived = await client.get("/api/v1/measurement-profiles", params={"archived": True})

    assert active.json()["items"] == []
    assert archived.json()["items"][0]["profile_id"] == archived_profile["id"]
    assert archived.json()["items"][0]["archived_at"] is not None


async def test_global_measurement_pagination_metadata_is_correct(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    for index in range(3):
        await create_profile(client, customer["id"], template, f"Profile {index}")

    response = await client.get("/api/v1/measurement-profiles", params={"page": 2, "page_size": 2})

    data = response.json()
    assert data | {"items": []} == {
        "items": [],
        "page": 2,
        "page_size": 2,
        "total": 3,
        "total_pages": 2,
    }
    assert len(data["items"]) == 1


async def test_global_measurement_results_are_newest_first(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    older = profile_payload(template, "Older")
    older["recorded_at"] = "2026-01-01T10:00:00Z"
    newer = profile_payload(template, "Newer")
    newer["recorded_at"] = "2026-08-01T10:00:00Z"
    await client.post(f"/api/v1/customers/{customer['id']}/measurements", json=older)
    await client.post(f"/api/v1/customers/{customer['id']}/measurements", json=newer)

    items = (await client.get("/api/v1/measurement-profiles")).json()["items"]

    assert [item["profile_name"] for item in items] == ["Newer", "Older"]


async def test_global_measurement_result_is_lightweight(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    profile = await create_profile(client, customer["id"], template)

    item = (await client.get("/api/v1/measurement-profiles")).json()["items"][0]

    assert "values" not in item
    assert item["value_count"] == len(profile["values"])
    assert item["template_name"] == "Senator"
    assert item["recorded_by_name"] == "Ada Okafor"


async def test_current_business_can_see_system_templates(client):
    await register_owner(client, "owner@example.com")
    response = await client.get("/api/v1/measurement-templates")
    assert response.status_code == 200
    names = {template["name"] for template in response.json()}
    assert {"Senator", "Agbada", "Shirt", "Trouser", "Suit", "Gown", "Blouse", "Skirt"} <= names


async def test_current_business_cannot_see_another_business_custom_template(client):
    first_cookies, first_session = await register_owner(client, "one@example.com")
    second_cookies, second_session = await register_owner(client, "two@example.com")
    async with client._transport.app.state.test_session_factory() as session:
        template = MeasurementTemplate(
            business_id=uuid.UUID(first_session["business"]["id"]),
            name="Private Kaftan",
            garment_type="KAFTAN",
            is_system_template=False,
            is_active=True,
        )
        session.add(template)
        await session.commit()

    use_cookies(client, second_cookies)
    names = {
        template["name"] for template in (await client.get("/api/v1/measurement-templates")).json()
    }
    assert "Private Kaftan" not in names
    use_cookies(client, first_cookies)
    names = {
        template["name"] for template in (await client.get("/api/v1/measurement-templates")).json()
    }
    assert "Private Kaftan" in names


async def test_template_detail_returns_ordered_fields(client):
    await register_owner(client, "owner@example.com")
    template = await senator_template(client)
    positions = [field["position"] for field in template["fields"]]
    assert positions == sorted(positions)
    assert template["fields"][0]["field_key"] == "shoulder"


async def test_owner_can_create_measurement_profile_for_their_customer(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    profile = await create_profile(client, customer["id"], template)
    assert profile["customer_id"] == customer["id"]
    assert profile["template_name"] == "Senator"
    assert len(profile["values"]) == len(template["fields"])


async def test_archived_customer_cannot_receive_a_new_measurement(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    assert (await client.post(f"/api/v1/customers/{customer['id']}/archive")).status_code == 200
    response = await client.post(
        f"/api/v1/customers/{customer['id']}/measurements",
        json=profile_payload(template),
    )
    assert response.status_code == 409


async def test_profile_stores_authenticated_user_as_recorded_by(client):
    _cookies, session_data = await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    profile = await create_profile(client, customer["id"], template)
    assert profile["recorded_by"] == session_data["user"]["id"]
    assert profile["recorded_by_name"] == "Ada Okafor"


async def test_profile_stores_values_correctly(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    profile = await create_profile(client, customer["id"], template)
    chest = next(value for value in profile["values"] if value["field_key"] == "chest")
    assert chest["value"] == "42.50"


async def test_required_template_field_omission_returns_validation_error(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    payload = profile_payload(template)
    payload["values"] = [value for value in payload["values"] if value["field_key"] != "chest"]
    response = await client.post(f"/api/v1/customers/{customer['id']}/measurements", json=payload)
    assert response.status_code == 422
    assert "missing" in response.json()["detail"].lower()


async def test_duplicate_field_key_in_values_is_rejected(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    payload = profile_payload(template)
    payload["values"][1]["field_key"] = payload["values"][0]["field_key"]
    response = await client.post(f"/api/v1/customers/{customer['id']}/measurements", json=payload)
    assert response.status_code == 422


async def test_unknown_template_field_is_rejected(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    payload = profile_payload(template)
    payload["values"][0]["field_key"] = "not_in_template"
    response = await client.post(f"/api/v1/customers/{customer['id']}/measurements", json=payload)
    assert response.status_code == 422
    assert "unknown" in response.json()["detail"].lower()


async def test_profile_creation_is_transactional(client, monkeypatch):
    from app.services import measurement_service

    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)

    class BrokenMeasurementValue:
        def __init__(self, **_kwargs):
            raise RuntimeError("value insert failed")

    monkeypatch.setattr(measurement_service, "MeasurementValue", BrokenMeasurementValue)
    response = await client.post(
        f"/api/v1/customers/{customer['id']}/measurements", json=profile_payload(template)
    )
    assert response.status_code == 500
    async with client._transport.app.state.test_session_factory() as session:
        profiles = (await session.execute(select(MeasurementProfile))).scalars().all()
        values = (await session.execute(select(MeasurementValue))).scalars().all()
        assert profiles == []
        assert values == []


async def test_user_cannot_create_measurements_for_another_tenant_customer(client):
    first_cookies, _ = await register_owner(client, "one@example.com")
    customer = await create_customer(client)
    await register_owner(client, "two@example.com")
    template = await senator_template(client)
    response = await client.post(
        f"/api/v1/customers/{customer['id']}/measurements", json=profile_payload(template)
    )
    assert response.status_code == 404
    use_cookies(client, first_cookies)
    assert (await client.get(f"/api/v1/customers/{customer['id']}")).status_code == 200


async def test_user_cannot_retrieve_another_tenant_measurement_profile(client):
    await register_owner(client, "one@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    profile = await create_profile(client, customer["id"], template)
    await register_owner(client, "two@example.com")
    response = await client.get(f"/api/v1/measurement-profiles/{profile['id']}")
    assert response.status_code == 404


async def test_user_sees_only_their_customer_profiles(client):
    first_cookies, _ = await register_owner(client, "one@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    await create_profile(client, customer["id"], template)
    await register_owner(client, "two@example.com")
    second_customer = await create_customer(client, "Tola")
    response = await client.get(f"/api/v1/customers/{second_customer['id']}/measurements")
    assert response.status_code == 200
    assert response.json()["items"] == []
    use_cookies(client, first_cookies)
    assert (await client.get(f"/api/v1/customers/{customer['id']}/measurements")).json()[
        "total"
    ] == 1


async def test_measurement_list_is_newest_first(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    older = profile_payload(template, "Older")
    older["recorded_at"] = "2026-01-01T10:00:00Z"
    newer = profile_payload(template, "Newer")
    newer["recorded_at"] = "2026-08-01T10:00:00Z"
    await client.post(f"/api/v1/customers/{customer['id']}/measurements", json=older)
    await client.post(f"/api/v1/customers/{customer['id']}/measurements", json=newer)
    response = await client.get(f"/api/v1/customers/{customer['id']}/measurements")
    assert [item["name"] for item in response.json()["items"]] == ["Newer", "Older"]


async def test_default_list_excludes_archived_profiles_and_archived_filter_works(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    profile = await create_profile(client, customer["id"], template)
    await client.post(f"/api/v1/measurement-profiles/{profile['id']}/archive")
    active = await client.get(f"/api/v1/customers/{customer['id']}/measurements")
    archived = await client.get(
        f"/api/v1/customers/{customer['id']}/measurements", params={"archived": True}
    )
    assert active.json()["items"] == []
    assert archived.json()["items"][0]["id"] == profile["id"]


async def test_profile_can_be_archived_and_restored(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    profile = await create_profile(client, customer["id"], template)
    archived = await client.post(f"/api/v1/measurement-profiles/{profile['id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    restored = await client.post(f"/api/v1/measurement-profiles/{profile['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["archived_at"] is None


async def test_numeric_decimal_values_remain_exact(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    profile = await create_profile(client, customer["id"], template)
    assert (
        next(value for value in profile["values"] if value["field_key"] == "chest")["value"]
        == "42.50"
    )
    async with client._transport.app.state.test_session_factory() as session:
        stored = (
            await session.execute(
                select(MeasurementValue).where(MeasurementValue.field_key == "chest")
            )
        ).scalar_one()
        assert stored.value == Decimal("42.50")


async def test_profile_list_pagination_metadata_is_correct(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    template = await senator_template(client)
    for index in range(3):
        await create_profile(client, customer["id"], template, f"Profile {index}")
    response = await client.get(
        f"/api/v1/customers/{customer['id']}/measurements",
        params={"page": 2, "page_size": 2},
    )
    data = response.json()
    assert data["page"] == 2
    assert data["page_size"] == 2
    assert data["total"] == 3
    assert data["total_pages"] == 2
    assert len(data["items"]) == 1


async def test_system_templates_contain_expected_seeded_defaults(client):
    await register_owner(client, "owner@example.com")
    template = await senator_template(client)
    keys = {field["field_key"] for field in template["fields"]}
    assert normalize_field_key("Round Sleeve") == "round_sleeve"
    assert {"shoulder", "chest", "round_sleeve", "trouser_length"} <= keys


async def test_business_cannot_use_another_tenant_custom_template(client):
    _first_cookies, first_session = await register_owner(client, "one@example.com")
    await create_customer(client)
    async with client._transport.app.state.test_session_factory() as session:
        template = MeasurementTemplate(
            business_id=uuid.UUID(first_session["business"]["id"]),
            name="Private",
            garment_type="PRIVATE",
            is_system_template=False,
            is_active=True,
        )
        template.fields.append(
            MeasurementTemplateField(
                field_name="Chest",
                field_key="chest",
                position=1,
                is_required=True,
            )
        )
        session.add(template)
        await session.commit()
        template_id = str(template.id)

    await register_owner(client, "two@example.com")
    customer = await create_customer(client, "Tola")
    response = await client.post(
        f"/api/v1/customers/{customer['id']}/measurements",
        json={
            "template_id": template_id,
            "name": "Private",
            "garment_type": "PRIVATE",
            "unit": "INCH",
            "values": [
                {"field_key": "chest", "field_name": "Chest", "value": "10.00", "position": 1}
            ],
        },
    )
    assert response.status_code == 404
