# 04. LLM 제공자 전환 — Gemini API → Vercel AI Gateway

- 기간: 2026-11-15
- 이슈: #13

## 배경
Gemini API를 직접 쓸 수 없는 상황이 생겨 제공자를 교체해야 했다. 조건은 **무료**, **tool calling 지원**, **배포 환경에서 키 관리 최소화**.

## 선택: Vercel AI Gateway
| 기준 | 내용 |
|---|---|
| 비용 | 팀당 30일마다 무료 크레딧 (무료 티어는 일부 모델, 모델별 rate limit) |
| API | OpenAI 호환 (`https://ai-gateway.vercel.sh/v1`) → 표준 `openai` SDK 사용 |
| 인증 | 로컬: `AI_GATEWAY_API_KEY` / Vercel 배포: OIDC 토큰 자동 (키 저장 불필요) |
| 모델 | 환경변수 `AI_MODEL`로 교체 (기본 `google/gemini-2.5-flash-lite`) |

## 변경 범위
- **`services/ai_agent.py` 한 파일 + 설정만 변경.** 서비스 레이어, 도구 함수, 라우터, 캐시, 프론트는 그대로.
- MVP에서 "LLM은 도구 호출 의도만, 실행은 서비스 레이어"로 분리해 둔 덕분에 제공자 교체 비용이 작았다.

## 구현 포인트

### 1. 자동 함수 호출 → 명시적 tool loop
Gemini SDK는 Python 함수를 넘기면 SDK가 알아서 호출했지만, OpenAI 호환 API에서는 직접 루프를 돈다.
```
LLM 호출 → tool_calls 있으면 실행 → 결과를 role=tool 메시지로 추가 → 다시 호출 (최대 6회)
```
- **최대 라운드 제한**으로 무한 루프·비용 폭주 방지.
- 도구 스키마(JSON Schema)를 명시적으로 작성 → `category`는 `enum`으로 제한.

### 2. 도구 에러를 LLM에게 돌려준다
- 존재하지 않는 id, 검증 실패 등은 예외로 요청을 끝내지 않고 `{"error": ...}`를 tool 결과로 반환 → LLM이 `list_todos`로 다시 확인하는 식으로 **스스로 복구**.

### 3. 인증 우선순위
`AI_GATEWAY_API_KEY` → 요청 헤더 `x-vercel-oidc-token`(미들웨어가 ContextVar에 저장) → 환경변수 `VERCEL_OIDC_TOKEN`
- 같은 코드가 로컬/배포 양쪽에서 동작. 배포 환경에 장기 비밀키를 두지 않는다.

## 테스트 (17개)
- 가짜 OpenAI 클라이언트로 **tool loop 전체 흐름** 검증: 1회차 `add_todo` 호출 → DB 반영 → 2회차 최종 답변, 대화 기록 저장.
- 도구 에러가 JSON으로 반환되는지 검증.
- 키 없음 → 503 유지.
