// 읽기 위주 트래픽: 쓰기 WRITE_RATIO(기본 5%), 나머지 중 목록 조회 ~70%, 월간 리포트 ~30%
// 사용: k6 run -e BASE_URL=http://localhost:8000 -e LABEL=cache-on k6/load-test.js
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:8000";
const LABEL = __ENV.LABEL || "run";
const WRITE_RATIO = Number(__ENV.WRITE_RATIO ?? 0.05);
const cacheHit = new Counter("cache_hit");
const cacheMiss = new Counter("cache_miss");

export const options = {
  scenarios: {
    read_heavy: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 50),
      duration: __ENV.DURATION || "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:todos}": ["p(95)<1000"],
    "http_req_duration{name:report}": ["p(95)<3000"],
  },
};

function track(res) {
  const c = res.headers["X-Cache"];
  if (c === "HIT") cacheHit.add(1);
  else if (c === "MISS") cacheMiss.add(1);
}

const month = new Date().toISOString().slice(0, 7);
const prev = (() => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
})();

export default function () {
  const r = Math.random();
  if (r < WRITE_RATIO) {
    const res = http.post(`${BASE}/todos`, JSON.stringify({ title: "k6 write", category: "기타" }), {
      headers: { "Content-Type": "application/json" },
      tags: { name: "write" },
    });
    check(res, { "write 201": (x) => x.status === 201 });
  } else if (r < 0.7) {
    const res = http.get(`${BASE}/todos?done=false`, { tags: { name: "todos" } });
    check(res, { "todos 200": (x) => x.status === 200 });
    track(res);
  } else {
    const m = Math.random() < 0.5 ? month : prev;
    const res = http.get(`${BASE}/reports/monthly?month=${m}`, { tags: { name: "report" } });
    check(res, { "report 200": (x) => x.status === 200 });
    track(res);
  }
}

export function handleSummary(data) {
  const m = data.metrics;
  const pick = (name) => {
    const v = m[name]?.values;
    return v ? { avg: v.avg?.toFixed(1), p95: v["p(95)"]?.toFixed(1), max: v.max?.toFixed(1) } : null;
  };
  const summary = {
    label: LABEL,
    rps: m.http_reqs.values.rate.toFixed(1),
    requests: m.http_reqs.values.count,
    failed_rate: m.http_req_failed.values.rate,
    all: pick("http_req_duration"),
    todos: pick("http_req_duration{name:todos}"),
    report: pick("http_req_duration{name:report}"),
    cache_hit: m.cache_hit?.values.count || 0,
    cache_miss: m.cache_miss?.values.count || 0,
  };
  return {
    stdout: JSON.stringify(summary, null, 2) + "\n",
    [`k6/results/${LABEL}.json`]: JSON.stringify(summary, null, 2),
  };
}
