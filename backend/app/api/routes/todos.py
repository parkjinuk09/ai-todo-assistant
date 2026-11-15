from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.todo import TodoCreate, TodoOut, TodoUpdate
from app.services import todo_service

router = APIRouter(prefix="/todos", tags=["todos"])


@router.get("", response_model=list[TodoOut])
def list_todos(done: bool | None = None, db: Session = Depends(get_db)):
    # 이미 직렬화된 바이트를 그대로 반환 (response_model 재검증 생략)
    body, status_ = todo_service.list_todos_cached(db, done)
    return Response(body, media_type="application/json", headers={"X-Cache": status_})


@router.post("", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
def create_todo(body: TodoCreate, db: Session = Depends(get_db)):
    return todo_service.create_todo(db, body)


@router.patch("/{todo_id}", response_model=TodoOut)
def update_todo(todo_id: int, body: TodoUpdate, db: Session = Depends(get_db)):
    return todo_service.update_todo(db, todo_id, body)


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    todo_service.delete_todo(db, todo_id)
