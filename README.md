# 🗂️ AI Todo Assistant

> 말로 관리하는 투두리스트. 챗봇이 할 일을 직접 추가·수정·완료하고, 매달 기록 리포트를 만들어 줍니다.
> 맥에서는 PWA로 설치해 Dock에서 앱처럼 실행할 수 있습니다.

![CI](https://github.com/parkjinuk09/ai-todo-assistant/actions/workflows/ci.yml/badge.svg)

## 주요 기능
| 기능 | 설명 |
|---|---|
| 💬 **AI 비서** | "내일 3시까지 OS 과제 넣어줘" → Gemini function calling으로 투두 생성·수정·완료·삭제 |
| 📋 **투두** | 마감일, 카테고리, 우선순위, 필터 |
| ☀️ **오늘 브리핑** | 밀린 일 / 오늘 마감 + AI 추천 순서 |
| 📊 **월간 리포트** | 완료율, 마감 준수, 요일·카테고리 통계 + AI 회고. 지난 달은 확정 저장 |
| 💻 **PWA** | 브라우저에서 "앱으로 설치" |

## 기술 스택
| 영역 | 기술 |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2, PostgreSQL 16 (JSONB), Redis 7 |
| AI | Google Gemini API (function calling) |
| Frontend | React 19, Vite, Tailwind CSS v4, vite-plugin-pwa |
| Test | pytest (15), fakeredis, k6 |
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
         PostgreSQL         Redis         Gemini API
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
docker compose up -d                       # Postgres :5433, Redis :6380

cd backend
python3.11 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env                       # GEMINI_API_KEY 입력 (https://aistudio.google.com)
.venv/bin/uvicorn app.main:app --reload    # http://localhost:8000/docs

cd ../frontend
npm install && cp .env.example .env
npm run dev                                # http://localhost:5173
```
테스트: `cd backend && .venv/bin/pytest` / 부하 테스트: [k6/README.md](k6/README.md)

## 배포 (Vercel, 무료 티어)
| 대상 | 서비스 | 설정 |
|---|---|---|
| API | Vercel Python (FastAPI, root: `backend`, 엔트리 `index.py`) | `GEMINI_API_KEY`, `CORS_ORIGINS` |
| DB | Neon (Vercel Marketplace) | `DATABASE_URL` 자동 주입 |
| Cache | Upstash Redis (Vercel Marketplace) | `KV_URL` 자동 주입 (`REDIS_URL`도 인식) |
| Web | Vercel (root: `frontend`, Vite) | `VITE_API_URL` |

- 서버리스에서는 `NullPool` 사용 + Neon pooled endpoint로 커넥션 고갈 방지
- `backend/Dockerfile`로 Render/Fly 등 컨테이너 환경에도 배포 가능

## 개발 기록
| # | 문서 | 내용 |
|---|---|---|
| 01 | [MVP](docs/dev-log/01-mvp.md) | 레이어드 구조, LLM 도구 설계, 장애 격리 |
| 02 | [월간 리포트](docs/dev-log/02-monthly-report.md) | SQL 집계(FILTER/CASE), JSONB 확정 저장 |
| 03 | [Redis + k6](docs/dev-log/03-redis-k6.md) | 1차 실패 원인 분석, 바이트 캐싱, UPSERT, stampede 락 |

포트폴리오 요약: [docs/PORTFOLIO.md](docs/PORTFOLIO.md)

## 개발 방식
모든 작업은 **이슈 → 브랜치 → PR → CI 통과 → squash merge** 로 진행했습니다. ([Issues](https://github.com/parkjinuk09/ai-todo-assistant/issues?q=is%3Aissue) · [PRs](https://github.com/parkjinuk09/ai-todo-assistant/pulls?q=is%3Apr))
