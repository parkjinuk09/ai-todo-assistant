from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Repeat = Literal["daily", "weekdays", "weekly", "monthly"]


class Subtask(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    done: bool = False


class TodoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_at: datetime | None = None
    all_day: bool = False
    category: str = "기타"
    priority: int = Field(default=2, ge=1, le=3)
    repeat: Repeat | None = None
    note: str = Field(default="", max_length=2000)
    subtasks: list[Subtask] = Field(default_factory=list, max_length=30)


class TodoUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    due_at: datetime | None = None
    all_day: bool | None = None
    category: str | None = None
    priority: int | None = Field(default=None, ge=1, le=3)
    done: bool | None = None
    repeat: Repeat | None = None
    note: str | None = Field(default=None, max_length=2000)
    subtasks: list[Subtask] | None = Field(default=None, max_length=30)


class TodoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    due_at: datetime | None
    all_day: bool = False
    category: str
    priority: int
    done: bool
    completed_at: datetime | None
    created_at: datetime
    repeat: str | None = None
    note: str = ""
    subtasks: list[Subtask] = []

    @field_validator("subtasks", mode="before")
    @classmethod
    def _none_is_empty(cls, v):
        return v or []

    @field_validator("note", mode="before")
    @classmethod
    def _none_is_blank(cls, v):
        return v or ""

    @field_validator("all_day", mode="before")
    @classmethod
    def _none_is_false(cls, v):
        return bool(v)
