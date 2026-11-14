# 01. MVP — Todo CRUD + Gemini 챗봇 에이전트

- 기간: 2026-11-15
- 이슈: #1 (백엔드), #2 (프론트)
- 스택: FastAPI · SQLAlchemy 2.0 · PostgreSQL 16 · Gemini API (function calling)

## 목표
"말로 관리하는 투두리스트". 사용자가 자연어로 말하면 LLM이 **도구 호출 의도**를 만들고, 실제 DB 변경은 서버의 서비스 레이어가 수행한다.

## 아키텍처
```
app/
├── api/routes/     # HTTP 레이어 (todos, chat)
├── services/       # 비즈니스 로직 (todo_service, ai_agent)
├── models/         # SQLAlchemy ORM
├── schemas/        # Pydantic 입출력 스키마
└── core/           # 설정, DB 세션
```
- 라우터는 얇게, 로직은 `services`에. 챗봇 도구도 같은 `todo_service`를 호출하므로 **REST API와 AI 경로의 검증 규칙이 동일**하다.

## 핵심 설계 결정

### 1. LLM에게 DB를 직접 주지 않는다
- Gemini에 SQL이나 DB 세션을 노출하지 않고, `add_todo / list_todos / update_todo / complete_todo / delete_todo` 5개 함수만 도구로 제공.
- 도구 함수는 요청마다 생성되는 **클로저**로, 해당 요청의 DB 세션에 바인딩된다 → 요청 간 세션 공유 없음.
- 도구 입력도 `TodoCreate`/`TodoUpdate` Pydantic 스키마를 거친다. 예: LLM이 `priority=5`를 보내면 1~3으로 보정 (테스트로 검증).

### 2. 날짜 해석은 LLM, 저장은 서버
- 시스템 프롬프트에 **현재 시각(Asia/Seoul)** 을 주입해 "내일 3시" 같은 상대 표현을 ISO 8601로 변환하게 함.
- DB에는 `TIMESTAMPTZ`로 저장(UTC), 표시할 때만 KST로 변환.

### 3. 외부 API 장애 격리
- 키 미설정 → `503`, Gemini 호출 실패 → `502` + 트랜잭션 롤백.
- `/briefing`은 AI 실패 시 규칙 기반 문장으로 **graceful degradation** — 핵심 기능이 외부 API에 종속되지 않게 함.

### 4. 대화 기억
- `chat_messages` 테이블에 저장하고 최근 20개를 컨텍스트로 전달 → 새로고침해도 맥락 유지.

## API
| Method | Path | 설명 |
|---|---|---|
| GET/POST | `/todos` | 목록(`?done=`), 생성 |
| PATCH/DELETE | `/todos/{id}` | 수정·완료, 삭제 |
| POST | `/chat` | 자연어 → 도구 실행 → 답변 + 갱신된 목록 |
| GET | `/chat` | 대화 기록 |
| GET | `/briefing` | 밀린 일/오늘 마감 + AI 추천 |

## 테스트
- pytest 5개: CRUD 흐름, 입력 검증(422), 키 미설정 503, 브리핑 fallback, **에이전트 도구가 실제로 DB를 변경하는지**.
- GitHub Actions에서 PR마다 실행.
- 로컬 Postgres(docker compose)에서 timezone 저장/조회 수동 확인.

## 트러블슈팅
- `psycopg[binary]==3.2.3`이 해당 플랫폼 휠이 없어 설치 실패 → `>=3.2.4`로 완화.
- SQLite(테스트)는 tz 정보를 버림 → 비교 전에 aware datetime으로 정규화하는 `_aware()` 추가.

## 다음 단계
- 월간 기록 리포트 (#3), Redis 캐싱 + k6 부하 테스트 (#4)
