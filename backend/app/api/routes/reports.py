from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.report import ReportOut
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/monthly", response_model=ReportOut)
def monthly_report(month: str | None = None, regenerate: bool = False,
                   db: Session = Depends(get_db)):
    """month=YYYY-MM (기본: 이번 달). 지난 달은 확정본을 저장해 재사용한다."""
    body, status_ = report_service.get_monthly_report_cached(db, month, regenerate)
    return Response(body, media_type="application/json", headers={"X-Cache": status_})

