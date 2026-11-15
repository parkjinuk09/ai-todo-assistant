# 03. Redis 캐싱 + k6 부하 테스트

- 기간: 2026-11-15
- 이슈: #4
- 키워드: cache-aside, 버전 키 무효화, 직렬화 바이트 캐싱, cache stampede 락, UPSERT 경쟁 상태, k6

## 목표
조회 API(투두 목록, 월간 리포트, 브리핑)에 Redis 캐시를 적용하고, k6로 **전/후를 수치로** 비교한다.

## 테스트 환경
- MacBook (로컬), uvicorn 단일 프로세스, PostgreSQL 16 / Redis 7 (docker compose)
- 데이터: 투두 3,000개 (최근 90일, `scripts/seed.py`, seed 고정)
- k6: VU 50, 30초, `constant-vus`
- 트래픽: 쓰기 5% / 목록 조회(`/todos?done=false`, 약 1,300건·254KB) 약 65% / 월간 리포트(이번 달·지난 달) 약 30%
- 매 실행 전 DB 재시드 + `FLUSHALL`

## 1차 시도: 단순 cache-aside → 효과 미미

| | RPS | 평균 | p95 | 실패율 |
|---|---|---|---|---|
| 캐시 OFF | 55.3 | 891ms | 1,667ms | 0.18% |
| 캐시 ON (v1) | 62.3 | 790ms | 1,677ms | 0.26% |

캐시 적중률이 44%인데도 p95가 그대로였다. 원인을 프로파일링했다.

### 원인 1: 병목은 DB가 아니라 CPU(직렬화)
요청 1회 구간별 측정 (1,302건):
| 구간 | 시간 |
|---|---|
| DB 조회 (I/O) | 47ms |
| ORM → dict | 7ms |
| HIT 경로: `json.loads` + `response_model` 재검증 + 재직렬화 | 수 ms ~ 10ms+ |

- uvicorn 단일 프로세스는 GIL 때문에 **CPU 작업이 직렬화**된다. 캐시로 줄인 건 I/O 대기(47ms)뿐이고, CPU 작업(파싱·검증·직렬화)은 HIT에서도 그대로 남아 RPS 상한(약 60)이 바뀌지 않았다.

### 원인 2: 경쟁 상태 버그 (실패 0.2%의 정체)
```
psycopg.errors.UniqueViolation: duplicate key value violates unique constraint "ix_monthly_reports_month"
```
- 지난 달 리포트를 **동시에 처음** 요청하면 두 요청이 모두 "저장본 없음"을 보고 INSERT → 하나가 500.
- 단위 테스트(단일 요청)로는 잡히지 않고 **부하 테스트에서 처음 드러난 버그**.

### 원인 3: 캐시 스탬피드
- 쓰기가 들어오면 버전 키가 올라가 관련 캐시가 한꺼번에 무효화 → 직후 50개 VU가 동시에 MISS를 맞고 전부 DB 집계를 실행.

## 2차 개선

### 1. 직렬화된 바이트를 그대로 캐시하고 그대로 응답
```python
# MISS: pydantic-core(Rust)로 한 번만 직렬화해서 Redis에 저장
_todo_list.dump_json([...])
# HIT: Redis 값을 그대로 Response로 반환 (파싱·검증·재직렬화 없음)
return Response(body, media_type="application/json", headers={"X-Cache": status_})
```
- HIT 경로의 CPU 비용이 사실상 "Redis GET + 소켓 쓰기"만 남는다.
- `X-Cache: HIT|MISS|BYPASS` 헤더로 k6에서 적중률을 집계.

### 2. UPSERT로 경쟁 상태 제거
```python
insert(MonthlyReport).values(...).on_conflict_do_update(index_elements=[MonthlyReport.month], set_=...)
```
- PostgreSQL / SQLite 방언을 런타임에 골라 테스트와 운영이 같은 코드 경로를 탄다.

### 3. SET NX 락으로 스탬피드 방지
- MISS 시 `SET lock:{key} NX EX 5`를 잡은 1개 요청만 loader 실행, 나머지는 20ms 간격으로 최대 2초 대기 후 채워진 캐시를 읽음.
- 락 보유자가 죽어도 TTL로 자동 해제, 대기 시간을 넘기면 직접 계산(**가용성 우선**).
- 테스트: 스레드 5개가 동시에 MISS → loader 1회 실행, 4개는 HIT.

### 4. 무효화: 버전 키 (O(1))
- 키 형식: `todos:list:{done}:v{N}`, `report:{month}:v{N}`, `briefing:{date}:v{N}`
- 투두 쓰기(REST·AI 도구 공통 경로인 `todo_service`)에서 `INCR todos:ver` 한 번 → 관련 캐시 전체 무효화. `KEYS`/`SCAN` 불필요, 옛 키는 TTL로 자연 소멸.
- 지난 달 확정 리포트는 버전 없이 `report:final:{month}` (TTL 1일), `regenerate` 시 삭제.

### 5. Redis는 선택적 의존성
- Redis 장애·타임아웃(0.5s) 시 예외를 삼키고 DB로 fallback (`X-Cache: BYPASS`). 테스트로 검증.

## 2차 결과

| 시나리오 | RPS | 평균 | p95 | 실패율 | 적중률 |
|---|---|---|---|---|---|
| 캐시 OFF (쓰기 5%) | 85.9 | 577ms | 1,072ms | 0% | - |
| **캐시 ON (쓰기 5%)** | **372.6** | **134ms** | **252ms** | **0%** | **91.4%** |
| 캐시 OFF (읽기 전용) | 92.0 | 540ms | 1,036ms | 0% | - |
| **캐시 ON (읽기 전용)** | **864.3** | **58ms** | **77ms** | **0%** | **99.98%** |

- 쓰기 5% 혼합: **처리량 4.3배, p95 76% 감소**
- 읽기 전용: **처리량 9.4배, p95 93% 감소**
- 실패율: 0.18~0.26% → **0%** (UPSERT)
- 캐시 OFF도 1차보다 빨라졌다(55→86 RPS): `response_model` 재검증 대신 `dump_json`으로 바로 직렬화한 효과.

원본 결과: `docs/perf/*.json`

## 회고
- "캐시 붙였더니 빨라졌다"가 아니라, **1차에서 효과가 없던 이유를 측정으로 찾은 것**이 핵심. 병목이 I/O인지 CPU인지 먼저 확인해야 했다.
- 부하 테스트는 성능 측정 도구이면서 **동시성 버그 탐지기**였다.

## 한계 / 다음 단계
- 목록 API가 전체 목록(254KB)을 반환 → 커서 기반 페이지네이션이 근본적인 해결책.
- 로컬 단일 머신에서 k6와 서버가 CPU를 나눠 쓰므로 절대 수치보다 **상대 비교**에 의미가 있다.
- 브리핑은 Gemini 호출(수백 ms~수 초)이 포함되므로 캐시 효과가 더 크지만, 무료 API 한도 때문에 부하 테스트에서는 제외했다.
