"""Redis cache-aside 헬퍼.

- REDIS_URL이 없거나 CACHE_ENABLED=false면 캐시 없이 동작 (테스트/부하 비교용)
- Redis 장애 시 예외를 삼키고 DB로 fallback → 캐시는 '있으면 빠른 것'이지 필수 의존성이 아니다
- 무효화는 버전 키(todos:ver)를 INCR 하는 방식: KEYS/SCAN 없이 O(1)로 관련 캐시 전체를 무효화
"""
import json
import logging
import time
from collections.abc import Callable
from typing import Any

from app.core.config import settings

log = logging.getLogger(__name__)
VERSION_KEY = "todos:ver"

_client = None


def get_client():
    global _client
    if not settings.cache_enabled or not settings.redis_url:
        return None
    if _client is None:
        import redis

        _client = redis.Redis.from_url(settings.redis_url, decode_responses=True,
                                       socket_timeout=0.5, socket_connect_timeout=0.5)
    return _client


def set_client(client) -> None:
    """테스트에서 fakeredis 주입용."""
    global _client
    _client = client


def _version(r) -> str:
    return r.get(VERSION_KEY) or "0"


def versioned(key: str) -> str | None:
    r = get_client()
    if r is None:
        return None
    try:
        return f"{key}:v{_version(r)}"
    except Exception as e:
        log.warning("redis unavailable: %s", e)
        return None


def get_or_set(key: str | None, ttl: int, loader: Callable[[], Any]) -> tuple[Any, str]:
    """(값, 'HIT'|'MISS'|'BYPASS')"""
    r = get_client()
    if r is None or key is None:
        return loader(), "BYPASS"
    try:
        cached = r.get(key)
        if cached is not None:
            return json.loads(cached), "HIT"
    except Exception as e:
        log.warning("redis get failed: %s", e)
        return loader(), "BYPASS"

    value = loader()
    try:
        r.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception as e:
        log.warning("redis set failed: %s", e)
    return value, "MISS"


LOCK_TTL = 5
LOCK_WAIT = 2.0


def get_or_set_raw(key: str | None, ttl: int, loader: Callable[[], bytes]) -> tuple[bytes, str]:
    """직렬화된 JSON 바이트를 그대로 캐시/반환한다.

    HIT 경로에서 json.loads → Pydantic 재검증 → 재직렬화를 하지 않으므로 CPU 비용이 거의 없다.
    MISS가 동시에 몰리면(cache stampede) SET NX 락을 잡은 1개 요청만 loader를 실행하고
    나머지는 잠깐 기다렸다가 채워진 캐시를 읽는다.
    """
    r = get_client()
    if r is None or key is None:
        return loader(), "BYPASS"
    try:
        cached = r.get(key)
        if cached is not None:
            return cached.encode(), "HIT"

        lock_key = f"lock:{key}"
        if not r.set(lock_key, "1", nx=True, ex=LOCK_TTL):
            deadline = time.monotonic() + LOCK_WAIT
            while time.monotonic() < deadline:
                time.sleep(0.02)
                cached = r.get(key)
                if cached is not None:
                    return cached.encode(), "HIT"
            # 락 보유자가 너무 오래 걸리면 직접 계산 (가용성 우선)
    except Exception as e:
        log.warning("redis get failed: %s", e)
        return loader(), "BYPASS"

    value = loader()
    try:
        r.set(key, value.decode(), ex=ttl)
        r.delete(f"lock:{key}")
    except Exception as e:
        log.warning("redis set failed: %s", e)
    return value, "MISS"


def delete(key: str) -> None:
    r = get_client()
    if r is None:
        return
    try:
        r.delete(key)
    except Exception as e:
        log.warning("redis delete failed: %s", e)


def bump_version() -> None:
    """투두가 바뀌면 호출 → 버전이 붙은 모든 캐시(목록, 이번 달 리포트, 브리핑)가 한 번에 무효화된다."""
    r = get_client()
    if r is None:
        return
    try:
        r.incr(VERSION_KEY)
    except Exception as e:
        log.warning("redis incr failed: %s", e)
