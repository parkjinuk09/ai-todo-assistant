from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TodoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_at: datetime | None = None
    category: str = "기타"
    priority: int = Field(default=2, ge=1, le=3)


class TodoUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    due_at: datetime | None = None
    category: str | None = None
    priority: int | None = Field(default=None, ge=1, le=3)
    done: bool | None = None


class TodoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    due_at: datetime | None
    category: str
    priority: int
    done: bool
    completed_at: datetime | None
    created_at: datetime
