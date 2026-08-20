import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business, get_current_user
from app.core.database import get_db_session
from app.models.business import Business
from app.models.task import TaskPriority, TaskStatus
from app.models.user import User
from app.schemas.task import TaskCreate, TaskListResponse, TaskPublic, TaskUpdate
from app.services.task_service import (
    create_task,
    delete_task,
    get_task_detail,
    list_tasks,
    update_task,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=TaskListResponse)
async def get_tasks(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    _: Annotated[User, Depends(get_current_user)],
    search: Annotated[str | None, Query(max_length=200)] = None,
    status: TaskStatus | None = None,
    priority: TaskPriority | None = None,
    assigned_to_id: uuid.UUID | None = None,
    overdue_only: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> TaskListResponse:
    return await list_tasks(
        session,
        business,
        search=search,
        status_filter=status,
        priority_filter=priority,
        assigned_to_id=assigned_to_id,
        overdue_only=overdue_only,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=TaskPublic, status_code=status.HTTP_201_CREATED)
async def add_task(
    payload: TaskCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TaskPublic:
    return await create_task(session, business, current_user, payload)


@router.get("/{task_id}", response_model=TaskPublic)
async def get_task(
    task_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    _: Annotated[User, Depends(get_current_user)],
) -> TaskPublic:
    return await get_task_detail(session, business, task_id)


@router.patch("/{task_id}", response_model=TaskPublic)
async def edit_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    _: Annotated[User, Depends(get_current_user)],
) -> TaskPublic:
    return await update_task(session, business, task_id, payload)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_task(
    task_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    _: Annotated[User, Depends(get_current_user)],
) -> None:
    await delete_task(session, business, task_id)
