from datetime import date

from app.services.date_hints import hint, resolve

SUN = date(2026, 11, 15)  # 일요일
WED = date(2026, 11, 18)  # 수요일


def d(text, today=SUN):
    return dict(resolve(text, today))


def test_fixed_words():
    assert d("내일 오전 10시 은행") == {"내일": date(2026, 11, 16)}
    assert d("모레 오후 2시로 바꿔") == {"모레": date(2026, 11, 17)}


def test_this_week_on_sunday_means_upcoming():
    assert d("이번주 금요일까지 독후감") == {"이번주 금요일": date(2026, 11, 20)}


def test_this_week_midweek():
    assert d("이번주 금요일", WED) == {"이번주 금요일": date(2026, 11, 20)}
    assert d("이번주 월요일", WED) == {"이번주 월요일": date(2026, 11, 23)}  # 지났으면 다가오는 월요일


def test_next_week_is_monday_based():
    assert d("다음주 화요일 저녁 7시") == {"다음주 화요일": date(2026, 11, 17)}
    assert d("다음 주 화요일", WED) == {"다음 주 화요일": date(2026, 11, 24)}
    assert d("다다음주 월요일", WED) == {"다다음주 월요일": date(2026, 11, 30)}


def test_bare_weekday_is_nearest_upcoming():
    assert d("금요일 회의", WED) == {"금요일": date(2026, 11, 20)}
    assert d("수요일 회의", WED) == {"수요일": WED}


def test_relative_days_and_month_day():
    assert d("3일 뒤 마감") == {"3일 뒤": date(2026, 11, 18)}
    assert d("12월 3일 시험") == {"12월 3일": date(2026, 12, 3)}
    assert d("1월 5일 여행") == {"1월 5일": date(2027, 1, 5)}


def test_hint_text_and_no_dates():
    assert hint("치과 완료", SUN) == ""
    assert hint("내일 치과", SUN) == "(날짜 참고: '내일' = 2026-11-16 월요일)"
