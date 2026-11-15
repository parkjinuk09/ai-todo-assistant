# k6 부하 테스트

```bash
docker compose up -d
cd backend
DATABASE_URL=postgresql://todo:todo@localhost:5433/todo python -m scripts.seed 3000
DATABASE_URL=postgresql://todo:todo@localhost:5433/todo REDIS_URL=redis://localhost:6380/0 \
  CACHE_ENABLED=true uvicorn app.main:app --port 8000
cd .. && k6 run -e LABEL=cache-on -e WRITE_RATIO=0.05 k6/load-test.js
```

| 환경 변수 | 기본값 | 설명 |
|---|---|---|
| `BASE_URL` | `http://localhost:8000` | 대상 서버 |
| `VUS` / `DURATION` | `50` / `30s` | 동시 사용자 / 시간 |
| `WRITE_RATIO` | `0.05` | 쓰기 비율 (캐시 무효화 빈도) |
| `LABEL` | `run` | 결과 파일 `k6/results/{LABEL}.json` |

결과 분석: [docs/dev-log/03-redis-k6.md](../docs/dev-log/03-redis-k6.md)
