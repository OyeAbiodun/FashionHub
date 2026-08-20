import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.customer import Customer
from app.models.order import Order
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User
from app.schemas.task import TaskCreate, TaskListResponse, TaskPublic, TaskUpdate


def task_to_public(task: Task) -> TaskPublic:
    now = datetime.now(UTC)
    is_overdue = False
    if task.due_at and task.status not in {TaskStatus.COMPLETED, TaskStatus.CANCELLED}:
        # Make comparison timezone-aware
        due = task.due_at if task.due_at.tzinfo else task.due_at.replace(tzinfo=UTC)
        is_overdue = due < now

    assigned_name = " ".join(
        part for part in [task.assigned_to.first_name, task.assigned_to.last_name] if part
    )
    creator_name = " ".join(
        part for part in [task.created_by.first_name, task.created_by.last_name] if part
    )

    return TaskPublic(
        id=task.id,
        business_id=task.business_id,
        title=task.title,
        description=task.description,
        order_id=task.order_id,
        customer_id=task.customer_id,
        assigned_to_id=task.assigned_to_id,
        assigned_to_name=assigned_name,
        created_by_id=task.created_by_id,
        created_by_name=creator_name,
        status=task.status,
        priority=task.priority,
        due_at=task.due_at,
        completed_at=task.completed_at,
        is_overdue=is_overdue,
        created_at=task.created_at,
    )


async def list_tasks(
    session: AsyncSession,
    business: Business,
    search: str | None = None,
    status_filter: TaskStatus | None = None,
    priority_filter: TaskPriority | None = None,
    assigned_to_id: uuid.UUID | None = None,
    overdue_only: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> TaskListResponse:
    base_stmt = select(Task).where(Task.business_id == business.id)

    if status_filter:
        base_stmt = base_stmt.where(Task.status == status_filter)
    if priority_filter:
        base_stmt = base_stmt.where(Task.priority == priority_filter)
    if assigned_to_id:
        base_stmt = base_stmt.where(Task.assigned_to_id == assigned_to_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        base_stmt = base_stmt.where(
            (Task.title.ilike(term)) | (Task.description.ilike(term))
        )
    if overdue_only:
        now = datetime.now(UTC)
        base_stmt = base_stmt.where(
            Task.due_at.is_not(None),
            Task.due_at < now,
            Task.status.not_in([TaskStatus.COMPLETED, TaskStatus.CANCELLED]),
        )

    # Counts summary
    all_stmt = select(Task).where(Task.business_id == business.id)
    all_tasks = (await session.execute(all_stmt)).scalars().all()
    now = datetime.now(UTC)

    pending_cnt = sum(1 for t in all_tasks if t.status == TaskStatus.PENDING)
    in_prog_cnt = sum(1 for t in all_tasks if t.status == TaskStatus.IN_PROGRESS)
    comp_cnt = sum(1 for t in all_tasks if t.status == TaskStatus.COMPLETED)
    overdue_cnt = sum(
        1
        for t in all_tasks
        if t.due_at
        and t.status not in {TaskStatus.COMPLETED, TaskStatus.CANCELLED}
        and (t.due_at if t.due_at.tzinfo else t.due_at.replace(tzinfo=UTC)) < now
    )

    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total_count = (await session.execute(count_stmt)).scalar_one_or_none() or 0

    stmt = (
        base_stmt.order_by(Task.due_at.asc().nulls_last(), Task.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    tasks = (await session.execute(stmt)).scalars().all()

    return TaskListResponse(
        items=[task_to_public(t) for t in tasks],
        total=total_count,
        page=page,
        page_size=page_size,
        pending_count=pending_cnt,
        in_progress_count=in_prog_cnt,
        completed_count=comp_cnt,
        overdue_count=overdue_cnt,
    )


async def create_task(
    session: AsyncSession, business: Business, creator: User, payload: TaskCreate
) -> TaskPublic:
    # Verify assignee belongs to business
    assignee_stmt = select(User).where(
        User.id == payload.assigned_to_id, User.business_id == business.id
    )
    assignee = (await session.execute(assignee_stmt)).scalar_one_or_none()
    if not assignee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned staff member not found in your business workspace.",
        )

    await _validate_task_references(session, business, payload.order_id, payload.customer_id)

    task = Task(
        business_id=business.id,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        order_id=payload.order_id,
        customer_id=payload.customer_id,
        assigned_to_id=assignee.id,
        created_by_id=creator.id,
        status=TaskStatus.PENDING,
        priority=payload.priority,
        due_at=payload.due_at,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task_to_public(task)


async def get_task_detail(
    session: AsyncSession, business: Business, task_id: uuid.UUID
) -> TaskPublic:
    stmt = select(Task).where(Task.id == task_id, Task.business_id == business.id)
    task = (await session.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task_to_public(task)


async def update_task(
    session: AsyncSession, business: Business, task_id: uuid.UUID, payload: TaskUpdate
) -> TaskPublic:
    stmt = select(Task).where(Task.id == task_id, Task.business_id == business.id)
    task = (await session.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if payload.title is not None:
        task.title = payload.title.strip()
    if payload.description is not None:
        task.description = payload.description.strip() if payload.description else None
    if payload.assigned_to_id is not None:
        # Verify assignee belongs to business
        assignee_stmt = select(User).where(
            User.id == payload.assigned_to_id, User.business_id == business.id
        )
        assignee = (await session.execute(assignee_stmt)).scalar_one_or_none()
        if not assignee:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned staff member not found in your business workspace.",
            )
        task.assigned_to_id = assignee.id

    await _validate_task_references(
        session,
        business,
        task.order_id,
        task.customer_id,
    )

    if payload.priority is not None:
        task.priority = payload.priority

    if payload.status is not None:
        task.status = payload.status
        if payload.status == TaskStatus.COMPLETED:
            task.completed_at = datetime.now(UTC)
        elif task.completed_at and payload.status != TaskStatus.COMPLETED:
            task.completed_at = None

    if payload.due_at is not None:
        task.due_at = payload.due_at

    await session.commit()
    await session.refresh(task)
    return task_to_public(task)


async def delete_task(session: AsyncSession, business: Business, task_id: uuid.UUID) -> None:
    stmt = select(Task).where(Task.id == task_id, Task.business_id == business.id)
    task = (await session.execute(stmt)).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    await session.delete(task)
    await session.commit()


async def _validate_task_references(
    session: AsyncSession,
    business: Business,
    order_id: uuid.UUID | None,
    customer_id: uuid.UUID | None,
) -> None:
    if customer_id is not None:
        customer = (
            await session.execute(
                select(Customer.id).where(
                    Customer.id == customer_id, Customer.business_id == business.id
                )
            )
        ).scalar_one_or_none()
        if customer is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    if order_id is not None:
        order = (
            await session.execute(
                select(Order).where(Order.id == order_id, Order.business_id == business.id)
            )
        ).scalar_one_or_none()
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        if customer_id is not None and order.customer_id != customer_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Task order and customer must belong together.",
            )
