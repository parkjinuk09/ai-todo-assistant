from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.todo import TodoOut


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    created_at: datetime


class ChatOut(BaseModel):
    reply: str
    actions: list[str]
    todos: list[TodoOut]


class BriefingOut(BaseModel):
    summary: str
    overdue: list[TodoOut]
    today: list[TodoOut]
