import fakeredis
import pytest

from app.core import cache


@pytest.fixture
def redis_cache(monkeypatch):
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(cache.settings, "redis_url", "redis://fake")
    cache.set_client(fake)
    yield fake
    cache.set_client(None)


def test_todos_list_hit_and_invalidate(client, redis_cache):
    client.post("/todos", json={"title": "a"})
    assert client.get("/todos").headers["X-Cache"] == "MISS"
    r = client.get("/todos")
    assert r.headers["X-Cache"] == "HIT" and len(r.json()) == 1

    tid = client.post("/todos", json={"title": "b"}).json()["id"]  # 쓰기 → 버전 증가
    r = client.get("/todos")
    assert r.headers["X-Cache"] == "MISS" and len(r.json()) == 2

    client.patch(f"/todos/{tid}", json={"done": True})
    assert client.get("/todos?done=false").json()[0]["title"] == "a"
    client.delete(f"/todos/{tid}")
    assert len(client.get("/todos").json()) == 1


def test_report_and_briefing_cached(client, redis_cache):
    client.post("/todos", json={"title": "a"})
    assert client.get("/reports/monthly").headers["X-Cache"] == "MISS"
    assert client.get("/reports/monthly").headers["X-Cache"] == "HIT"
    assert client.get("/briefing").headers["X-Cache"] == "MISS"
    assert client.get("/briefing").headers["X-Cache"] == "HIT"

    client.post("/todos", json={"title": "b"})
    r = client.get("/reports/monthly")
    assert r.headers["X-Cache"] == "MISS" and r.json()["stats"]["created"] == 2

    assert client.get("/reports/monthly?month=2025-01").headers["X-Cache"] == "MISS"
    assert client.get("/reports/monthly?month=2025-01").headers["X-Cache"] == "HIT"
    assert client.get("/reports/monthly?month=2025-01&regenerate=true").headers["X-Cache"] == "BYPASS"


def test_redis_down_falls_back_to_db(client, monkeypatch):
    class Broken:
        def __getattr__(self, name):
            def fail(*a, **k):
                raise ConnectionError("down")
            return fail

    monkeypatch.setattr(cache.settings, "redis_url", "redis://down")
    cache.set_client(Broken())
    try:
        client.post("/todos", json={"title": "a"})
        r = client.get("/todos")
        assert r.status_code == 200 and r.headers["X-Cache"] == "BYPASS" and len(r.json()) == 1
    finally:
        cache.set_client(None)


def test_no_redis_is_bypass(client):
    assert client.get("/todos").headers["X-Cache"] == "BYPASS"


def test_stampede_lock_waits_for_filler(redis_cache):
    import threading

    calls = []

    def slow_loader():
        calls.append(1)
        import time
        time.sleep(0.2)
        return b'{"ok":true}'

    results = []
    threads = [threading.Thread(target=lambda: results.append(cache.get_or_set_raw("k", 60, slow_loader)))
               for _ in range(5)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len(calls) == 1  # loader는 1번만 실행
    assert sorted(s for _, s in results) == ["HIT"] * 4 + ["MISS"]
