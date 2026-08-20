from datetime import UTC, datetime, timedelta

import pytest


@pytest.mark.asyncio
async def test_tasks_management_flow(client):
    # Register business owner
    await client.post(
        "/api/v1/auth/register",
        json={
            "user": {
                "first_name": "Task",
                "last_name": "Master",
                "email": "taskmaster@example.com",
                "password": "StrongPass123!",
            },
            "business": {"name": "Task Studio", "phone": "+2348001112255"},
        },
    )

    # Get team members to get assignee ID (owner ID)
    team_res = await client.get("/api/v1/team")
    assert team_res.status_code == 200
    owner_user = team_res.json()[0]
    assignee_id = owner_user["id"]

    # 1. Create a task with timeline deadline
    due_date = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    create_task_res = await client.post(
        "/api/v1/tasks",
        json={
            "title": "Cut Agbada Fabric for Order #ORD-0001",
            "description": "Ensure 4 yards of fabric is cut to specifications.",
            "assigned_to_id": assignee_id,
            "priority": "HIGH",
            "due_at": due_date,
        },
    )
    assert create_task_res.status_code == 201
    task_data = create_task_res.json()
    assert task_data["title"] == "Cut Agbada Fabric for Order #ORD-0001"
    assert task_data["priority"] == "HIGH"
    assert task_data["status"] == "PENDING"
    assert task_data["is_overdue"] is False

    task_id = task_data["id"]

    # 2. List tasks
    list_tasks_res = await client.get("/api/v1/tasks")
    assert list_tasks_res.status_code == 200
    tasks_list = list_tasks_res.json()
    assert tasks_list["total"] == 1
    assert tasks_list["pending_count"] == 1

    # 3. Update task status to IN_PROGRESS then COMPLETED
    update_res = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "IN_PROGRESS"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "IN_PROGRESS"

    complete_res = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "COMPLETED"},
    )
    assert complete_res.status_code == 200
    assert complete_res.json()["status"] == "COMPLETED"
    assert complete_res.json()["completed_at"] is not None

    # 4. Delete task
    del_res = await client.delete(f"/api/v1/tasks/{task_id}")
    assert del_res.status_code == 204
