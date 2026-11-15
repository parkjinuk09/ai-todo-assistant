# 02. 월간 기록 리포트

- 기간: 2026-11-15
- 이슈: #3
- 키워드: SQL 집계(FILTER / CASE / GROUP BY), JSONB, 확정 리포트 저장, LLM 비용 절감

## 목표
한 달 동안의 투두 기록을 **숫자(집계)** 와 **해석(AI 회고)** 으로 보여준다.

## 지표 정의
| 지표 | 정의 |
|---|---|
| created | 해당 월에 **생성**된 할 일 수 |
| completed | 해당 월에 **완료**된 할 일 수 (`completed_at` 기준) |
| completion_rate | 해당 월 생성분 중 현재 완료된 비율 |
| on_time / late | 완료 시각 ≤ 마감 / > 마감 |
| still_pending | 해당 월 생성분 중 미완료 |
| by_category | 카테고리별 생성/완료 |
| by_weekday, best_weekday | 완료 요일 분포 (KST) |

→ "생성 기준"과 "완료 기준"을 분리. 지난달에 만든 일을 이번 달에 끝내면 이번 달 `completed`에만 잡힌다.
→ 이를 위해 MVP에 없던 `completed_at` 컬럼을 사용 (done 토글 시 서비스 레이어에서 기록).

## 핵심 설계 결정

### 1. 집계는 DB, 해석은 LLM
- 숫자는 SQL로 정확하게 계산하고, LLM에는 **집계 결과만** 전달해 회고 문장을 생성.
- LLM에게 원본 투두 목록을 넘기지 않으므로 토큰 사용량이 데이터 양과 무관하게 일정하고, 숫자 환각이 없다.

### 2. 쿼리 3번으로 끝내기
```python
select(func.count(),
       func.count().filter(Todo.done.is_(True)),
       func.count().filter(Todo.done.is_(False))).where(created_in)
```
- `COUNT(*) FILTER (WHERE ...)`로 한 번의 스캔에서 여러 카운트를 계산.
- 카테고리별은 `SUM(CASE WHEN created_in ...)`, `SUM(CASE WHEN completed_in ...)` + `GROUP BY`.
- 요일 추출은 DB마다 문법이 달라(`EXTRACT(ISODOW)` vs `strftime`) 완료 시각만 조회해 앱에서 KST 변환 후 집계 → 테스트(SQLite)와 운영(Postgres) 동작 일치.

### 3. 지난 달은 "확정본"으로 저장
- 지난 달 데이터는 더 이상 바뀌지 않으므로, 첫 요청 시 생성한 리포트를 `monthly_reports`(stats는 **JSONB**)에 저장하고 이후 재사용.
- 이번 달은 진행 중이라 매번 새로 집계(저장 안 함), 응답에 `finalized` 플래그로 구분.
- `?regenerate=true`로 강제 재생성 가능.
- 효과: 같은 달 리포트를 여러 번 열어도 **LLM 호출은 1회**.

### 4. 입력 검증
- `month`는 `YYYY-MM` 정규식 검증, 미래 달 요청은 422.

## API
| Method | Path | 설명 |
|---|---|---|
| GET | `/reports/monthly?month=YYYY-MM&regenerate=` | 월간 리포트 (기본: 이번 달) |
| GET | `/reports/months` | 저장된(확정) 리포트 월 목록 |

## 테스트 (총 9개 통과)
- 고정 데이터로 지표 계산 검증: 완료율 75%, on_time/late 1/1, 최고 요일 '화'.
- 지난 달: 첫 요청 후 저장 → 데이터 추가해도 확정본 유지 → `regenerate` 시 반영.
- 이번 달: 저장 안 됨, `finalized=false`.
- 잘못된/미래 month → 422.
- 로컬 Postgres에서 `FILTER`, `JSONB` 동작 확인.

## 프론트
- 상단 탭 `📋 할 일 / 📊 월간 리포트`, 월 이동(‹ ›), 지표 카드 4개, AI 회고, 요일 막대, 카테고리 진행률 바.

## 다음 단계
- 확정 리포트는 DB에서 읽지만 이번 달 리포트는 매번 집계 + LLM 호출 → **Redis 캐싱**으로 개선 (#4)
