import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.task import TaskPriority, TaskStatus


class TaskPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    title: str
    description: str | None = None
    order_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    assigned_to_id: uuid.UUID
    assigned_to_name: str
    created_by_id: uuid.UUID
    created_by_name: str
    status: TaskStatus
    priority: TaskPriority
    due_at: datetime | None = None
    completed_at: datetime | None = None
    is_overdue: bool = False
    created_at: datetime


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    order_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    assigned_to_id: uuid.UUID
    priority: TaskPriority = TaskPriority.MEDIUM
    due_at: datetime | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    assigned_to_id: uuid.UUID | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_at: datetime | None = None


class TaskCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class TaskCommentPublic(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    author_id: uuid.UUID
    author_name: str
    body: str
    created_at: datetime


class TaskListResponse(BaseModel):
    items: list[TaskPublic]
    total: int
    page: int
    page_size: int
    pending_count: int
    in_progress_count: int
    completed_count: int
    overdue_count: int
