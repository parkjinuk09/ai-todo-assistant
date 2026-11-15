"""사용자 문장 속 한국어 날짜 표현을 서버에서 실제 날짜로 풀어 준다.

작은 로컬 모델은 "이번주 금요일", "다음주 화요일" 같은 요일 계산을 자주 틀린다.
날짜 계산은 코드가 하고, 모델은 결과를 옮겨 적기만 하게 한다.
"""
import re
from datetime import date, timedelta

WEEKDAYS = "월화수목금토일"
FIXED = {"오늘": 0, "내일": 1, "모레": 2, "글피": 3}

WEEKDAY_RE = re.compile(r"(다다음\s?주|다음\s?주|이번\s?주|이번)?\s*([월화수목금토일])요일")
AFTER_RE = re.compile(r"(\d{1,2})\s*일\s*(?:뒤|후)")
MONTH_DAY_RE = re.compile(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일")


def _weekday_date(today: date, prefix: str | None, wd: int) -> date:
    monday = today - timedelta(days=today.weekday())
    prefix = (prefix or "").replace(" ", "")
    if prefix == "다음주":
        return monday + timedelta(weeks=1, days=wd)
    if prefix == "다다음주":
        return monday + timedelta(weeks=2, days=wd)
    if prefix in ("이번주", "이번"):
        d = monday + timedelta(days=wd)
        # 일요일에 "이번주 금요일"처럼 이미 지난 요일이면 다가오는 그 요일을 뜻한다
        return d if d >= today else d + timedelta(weeks=1)
    # 그냥 "금요일": 오늘 이후로 가장 가까운 그 요일 (오늘이면 오늘)
    return today + timedelta(days=(wd - today.weekday()) % 7)


def resolve(text: str, today: date) -> list[tuple[str, date]]:
    """[(원문 표현, 날짜)] — 문장에 나온 순서대로, 중복 없이."""
    found: list[tuple[int, str, date]] = []
    for word, n in FIXED.items():
        for m in re.finditer(word, text):
            found.append((m.start(), word, today + timedelta(days=n)))
    for m in WEEKDAY_RE.finditer(text):
        found.append((m.start(), m.group(0).strip(), _weekday_date(today, m.group(1), WEEKDAYS.index(m.group(2)))))
    for m in AFTER_RE.finditer(text):
        found.append((m.start(), m.group(0), today + timedelta(days=int(m.group(1)))))
    for m in MONTH_DAY_RE.finditer(text):
        try:
            d = date(today.year, int(m.group(1)), int(m.group(2)))
        except ValueError:
            continue
        if d < today - timedelta(days=30):  # 한참 지난 날짜면 내년
            d = d.replace(year=today.year + 1)
        found.append((m.start(), m.group(0), d))

    seen, out = set(), []
    for _, phrase, d in sorted(found):
        if phrase not in seen:
            seen.add(phrase)
            out.append((phrase, d))
    return out


def hint(text: str, today: date) -> str:
    pairs = resolve(text, today)
    if not pairs:
        return ""
    return "(날짜 참고: " + ", ".join(f"'{p}' = {d.isoformat()} {WEEKDAYS[d.weekday()]}요일" for p, d in pairs) + ")"
