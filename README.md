# AI Todo Assistant

> 나 혼자 쓰는 할 일 목록. 내 맥에서 도는 로컬 모델(Ollama)에게 말로 할 일을 추가·수정·완료시키고, 매달 기록을 돌아봅니다.
> 외부 AI API 키 없이 동작하며, PWA로 설치해 Dock에서 앱처럼 실행합니다.

![CI](https://github.com/parkjinuk09/ai-todo-assistant/actions/workflows/ci.yml/badge.svg)

## 주요 기능
| 기능 | 설명 |
|---|---|
| **비서** | "다음주 화요일 7시 발표 준비 추가" → 로컬 LLM(Ollama, `qwen2.5:7b`) tool calling으로 추가·수정·완료·삭제 |
| **할 일** | 마감 기준으로 밀린 일 / 오늘 / 다가오는 일 / 날짜 없음 자동 분류, 완료 접기 |
| **캘린더** | 월 보기, 날짜를 눌러 그날 할 일 보기·추가, 다른 날로 끌어다 놓으면 시간은 두고 날짜만 이동 |
| **추천** | 남은 할 일을 보고 뭐부터 할지 한 번에 추천 |
| **월간 기록** | 완료율, 마감 준수, 요일·분류 통계 + 회고. 지난 달은 확정 저장 |
| **맥 빠른 추가** | 어느 앱에서든 `⌘⇧D` → 반투명 입력창에 한 줄 → 비서가 처리하고 맥 알림으로 결과. 메뉴 막대에서 오늘·밀린 일 확인/완료 |
| **PWA** | Chrome에서 Dock에 앱으로 설치 |

## 기술 스택
| 영역 | 기술 |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2, PostgreSQL 16 (JSONB), Redis 7 |
| AI | Ollama 로컬 모델 (OpenAI 호환 API, tool calling). `LLM_BASE_URL`만 바꾸면 다른 OpenAI 호환 서버로 교체 |
| Frontend | React 19, Vite, Tailwind CSS v4, vite-plugin-pwa |
| Test | pytest (36), fakeredis, k6 |
| CI | GitHub Actions (pytest → 프론트 빌드 → k6 smoke) |

## 아키텍처
```
[React PWA] ──REST──▶ [FastAPI]
                        ├── api/routes      얇은 HTTP 레이어
                        ├── services        todo / ai_agent / report (비즈니스 로직)
                        ├── core/cache      Redis cache-aside (버전 키 무효화, stampede 락)
                        └── models/schemas
                              │
              ┌───────────────┼───────────────┐
         PostgreSQL         Redis      Ollama (localhost)
```
- AI 도구와 REST API가 **같은 서비스 레이어**를 호출 → 검증·캐시 무효화 규칙이 하나.

## 성능 (k6, VU 50 · 30s · 투두 3,000개)
| | RPS | p95 | 실패율 |
|---|---|---|---|
| 캐시 OFF | 85.9 | 1,072ms | 0% |
| **캐시 ON** | **372.6** (×4.3) | **252ms** | **0%** |
| 캐시 ON (읽기 전용) | 864.3 (×9.4) | 77ms | 0% |

자세한 분석: [docs/dev-log/03-redis-k6.md](docs/dev-log/03-redis-k6.md)

## 로컬 실행
```bash
brew install ollama && ollama serve        # 별도 터미널
ollama pull qwen2.5:7b                     # 약 4.7GB, 한 번만

docker compose up -d                       # Postgres :5433, Redis :6380

cd backend
python3.11 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env                       # 기본값이 로컬 Ollama라 수정 불필요
.venv/bin/uvicorn app.main:app --reload    # http://localhost:8000/docs

cd ../frontend
npm install && cp .env.example .env
npm run dev                                # http://localhost:5173
```
테스트: `cd backend && .venv/bin/pytest` / 부하 테스트: [k6/README.md](k6/README.md)

## 배포 (Vercel, 무료 티어)
- 웹: https://ai-todo-web-rho.vercel.app · API: https://ai-todo-api.vercel.app (`/docs`)

| 대상 | 서비스 | 설정 |
|---|---|---|
| API | Vercel Python (FastAPI, root: `backend`, 엔트리 `index.py`) | `CORS_ORIGINS` |
| DB | Neon (Vercel Marketplace) | `DATABASE_URL` 자동 주입 |
| Cache | Upstash Redis (Vercel Marketplace) | `KV_URL` 자동 주입 (`REDIS_URL`도 인식) |
| Web | Vercel (root: `frontend`, Vite) | `VITE_API_URL` |

- **배포본에서는 비서 기능이 꺼집니다.** 로컬 모델은 내 맥에만 있으므로, 배포 서버는 `/health`에 `llm: false`와 이유를 내려 주고 화면은 입력을 막습니다. 할 일·월간 기록은 정상 동작.
- 서버리스에서는 `NullPool` 사용 + Neon pooled endpoint로 커넥션 고갈 방지
- `backend/Dockerfile`로 Render/Fly 등 컨테이너 환경에도 배포 가능

## 개발 기록
| # | 문서 | 내용 |
|---|---|---|
| 01 | [MVP](docs/dev-log/01-mvp.md) | 레이어드 구조, LLM 도구 설계, 장애 격리 |
| 02 | [월간 리포트](docs/dev-log/02-monthly-report.md) | SQL 집계(FILTER/CASE), JSONB 확정 저장 |
| 03 | [Redis + k6](docs/dev-log/03-redis-k6.md) | 1차 실패 원인 분석, 바이트 캐싱, UPSERT, stampede 락 |
| 04 | [LLM 제공자 전환](docs/dev-log/04-ai-gateway.md) | Gemini SDK → AI Gateway, 수동 tool loop, OIDC 인증 |
| 05 | [로컬 LLM + 화면 재설계](docs/dev-log/05-ollama-redesign.md) | 작은 모델: 날짜는 코드가 계산, 조회는 DB로, 거짓 성공 방지 / 대체 문장 캐시 버그 / UI 정리 |
| 07 | [맥 메뉴 막대 앱](docs/dev-log/07-mac-quickadd.md) | 전역 단축키, 로그인 시 자동 실행, 문서 폴더 접근 제한(TCC) 우회 |
| 06 | [맥 스타일 화면 + 캘린더](docs/dev-log/06-mac-ui-calendar.md) | 반투명 재질 토큰, 다크 모드, 캘린더 끌어 옮기기, 좁은 화면 점 표시 |

포트폴리오 요약: [docs/PORTFOLIO.md](docs/PORTFOLIO.md)

## 개발 방식
모든 작업은 **이슈 → 브랜치 → PR → CI 통과 → squash merge** 로 진행했습니다. ([Issues](https://github.com/parkjinuk09/ai-todo-assistant/issues?q=is%3Aissue) · [PRs](https://github.com/parkjinuk09/ai-todo-assistant/pulls?q=is%3Apr))

## 맥에서 로컬로 쓰기 (메뉴 막대 앱)
```bash
./mac/install.sh     # 웹 화면 빌드 + 메뉴 막대 앱 빌드 + 로그인 시 자동 실행 등록
./mac/uninstall.sh   # 해제 (할 일 데이터는 그대로)
```
- `⌘⇧D`: 입력창 열기/닫기. Enter로 보내고 Esc로 닫기
- 웹 화면은 http://localhost:8000 (백엔드가 같이 내려 줌)
- 코드를 고친 뒤에는 `install.sh`를 다시 실행하면 반영
- 필요한 것: Docker Desktop, Ollama(`qwen2.5:7b`), Xcode 명령줄 도구

