from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.report import ReportOut
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/monthly", response_model=ReportOut)
def monthly_report(month: str | None = None, regenerate: bool = False, db: Session = Depends(get_db)):
    """month=YYYY-MM (기본: 이번 달). 지난 달은 확정본을 저장해 재사용한다."""
    return report_service.get_monthly_report(db, month, regenerate)


@router.get("/months", response_model=list[str])
def saved_months(db: Session = Depends(get_db)):
    return report_service.list_saved_months(db)
