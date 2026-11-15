# AI Todo Assistant — 백엔드 포트폴리오 요약

**FastAPI · PostgreSQL · Redis · LLM tool calling (Vercel AI Gateway) · k6**
GitHub: https://github.com/parkjinuk09/ai-todo-assistant

## 한 줄 요약
자연어로 투두를 관리하는 AI 비서 서비스. LLM에는 서비스 함수만 도구로 노출해 안전하게 DB를 조작하고, Redis 캐싱으로 **처리량 4.3배 · p95 76% 감소**, 부하 테스트 중 발견한 **동시성 버그를 UPSERT로 해결**했습니다.

## 핵심 성과
| 항목 | Before | After |
|---|---|---|
| 처리량 (쓰기 5% 혼합) | 85.9 RPS | **372.6 RPS (×4.3)** |
| p95 응답시간 | 1,072ms | **252ms** |
| 처리량 (읽기 전용) | 92.0 RPS | **864.3 RPS (×9.4)** |
| 실패율 (부하 시) | 0.18~0.26% | **0%** |
| 지난 달 리포트 LLM 호출 | 요청마다 | **월 1회** |

## 문제 해결 사례

### 1. 캐시를 붙였는데 빨라지지 않았다 → 병목은 CPU였다
- **상황**: 단순 cache-aside 적용 후 적중률 44%인데 p95 변화 없음 (1,667 → 1,677ms).
- **분석**: 구간별 측정 결과 DB I/O는 47ms였고, HIT에서도 `json.loads → Pydantic 재검증 → 재직렬화`가 반복됐다. 단일 프로세스(GIL)에서 CPU 작업이 상한을 결정하고 있었다.
- **해결**: pydantic-core로 한 번 직렬화한 **JSON 바이트를 그대로 캐시하고 그대로 응답**. HIT 경로를 Redis GET + 소켓 쓰기로 축소.
- **결과**: 55 → 372 RPS.

### 2. 부하 테스트에서만 나타난 500 에러 → 경쟁 상태
- **상황**: k6 실행 중 0.2% 실패, 로그에 `UniqueViolation (monthly_reports.month)`.
- **원인**: 동시 요청이 모두 "저장본 없음"을 확인한 뒤 INSERT (check-then-act).
- **해결**: `INSERT ... ON CONFLICT DO UPDATE`로 원자적 UPSERT. Postgres/SQLite 방언을 런타임 선택해 테스트와 운영 코드 경로를 통일.
- **결과**: 실패율 0%, 멱등성 테스트 추가.

### 3. 무효화 직후 요청 폭주 → stampede 락
- 쓰기로 캐시가 무효화되면 50개 VU가 동시에 집계 쿼리를 실행.
- `SET NX EX` 락으로 1개 요청만 재계산하고 나머지는 대기 후 HIT. 락 보유자 장애 대비 TTL, 대기 초과 시 직접 계산(가용성 우선).
- 멀티스레드 테스트로 loader 1회 실행 검증.

## 설계 포인트
- **LLM 권한 최소화**: LLM에 SQL/세션을 주지 않고 `add/list/update/complete/delete` 5개 함수만 노출. 도구 입력도 REST와 같은 Pydantic 스키마로 검증 (예: priority 범위 보정).
- **단일 서비스 레이어**: AI 경로와 REST 경로가 같은 `todo_service`를 호출 → 검증과 캐시 무효화가 한 곳에서 처리.
- **O(1) 캐시 무효화**: 버전 키 `INCR` 한 번으로 목록·리포트·브리핑 캐시 일괄 무효화. KEYS/SCAN 불필요.
- **외부 의존성 격리**: Gemini 실패 → 503/502 + 롤백, 브리핑·리포트는 규칙 기반 문장으로 fallback. Redis 장애 → DB fallback.
- **집계는 SQL, 해석은 LLM**: `COUNT(*) FILTER`, `SUM(CASE)`, `GROUP BY`로 정확히 계산하고 LLM에는 요약 수치만 전달 → 숫자 환각 없음, 토큰 사용량 일정.

## 품질
- pytest 15개: CRUD, 검증, AI 도구의 DB 반영, 리포트 지표, 확정 저장/재생성, 캐시 HIT/MISS/무효화, Redis 장애, stampede, UPSERT 멱등성.
- GitHub Actions: pytest → 프론트 빌드 → **Postgres·Redis 서비스 컨테이너로 k6 smoke 테스트**.
- 이슈 → PR → CI → squash merge 워크플로.

## 다음 개선
- 목록 API 커서 기반 페이지네이션 (현재 전체 목록 254KB 반환)
- Alembic 마이그레이션 도입 (현재 `create_all`)
- 인증 추가 (현재 단일 사용자)
