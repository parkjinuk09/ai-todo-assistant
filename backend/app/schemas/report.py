from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CategoryStat(BaseModel):
    category: str
    created: int
    completed: int


class ReportStats(BaseModel):
    created: int
    completed: int
    completion_rate: float          # 이번 달 생성 중 완료 비율 (%)
    on_time: int                    # 마감 전에 끝낸 수
    late: int                       # 마감 지나서 끝낸 수
    still_pending: int              # 이번 달 생성, 아직 미완료
    by_category: list[CategoryStat]
    by_weekday: dict[str, int]      # 완료 요일 분포
    best_weekday: str | None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    month: str
    stats: ReportStats
    ai_comment: str
    generated_at: datetime
    finalized: bool                 # 지난 달이면 확정(저장본), 이번 달이면 진행 중
