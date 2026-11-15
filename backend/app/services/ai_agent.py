"""LLM tool calling 기반 투두 에이전트 (OpenAI 호환 API, 기본: 로컬 Ollama).

LLM은 '도구 호출 의도'만 만들고, 실제 DB 변경은 서버의 서비스 레이어가 수행한다.
제공자 교체는 환경변수(LLM_BASE_URL / LLM_API_KEY / LLM_MODEL)만 바꾸면 된다.
"""
import json
import re
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ChatMessage
from app.schemas.todo import TodoCreate, TodoUpdate
from app.services import date_hints, todo_service

SYSTEM_PROMPT = """너는 사용자의 개인 투두 비서야.
- 사용자가 할 일을 말하면 반드시 도구를 호출해서 직접 추가/수정/완료/삭제해. 도구 호출을 글로 흉내 내지 마.
- 수정·완료·삭제할 때는 아래 '지금 할 일' 목록의 id를 써. 목록에 없을 때만 list_todos로 찾아.
- 날짜는 아래 달력을 보고 'YYYY-MM-DDTHH:MM' 형식으로 넣어. 시간을 말 안 했으면 날짜만 넣어.
- 메시지 끝에 '(날짜 참고: …)'가 있으면 그 날짜를 계산하지 말고 그대로 써.
- 할 일을 물어보면 [지금 할 일]에서 해당 묶음의 제목과 시간을 나열해. 날짜를 직접 계산하지 말고, id는 말하지 마.
- category는 공부/일/개인/건강/기타 중 하나. priority는 사용자가 "중요/급해"라고 하면 1, "나중에/급하지 않아"라고 하면 3, 아무 말 없으면 넣지 마.
- 반드시 한국어로만 답해.
- 답변은 한국어 반말로 한두 문장. 무엇을 바꿨는지만 말해."""

MAX_TOOL_ROUNDS = 6
WEEKDAYS = "월화수목금토일"


class AIUnavailable(Exception):
    pass


def _client():
    from openai import OpenAI

    return OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url,
                  timeout=settings.llm_timeout, max_retries=0)


def _complete(client, **kwargs):
    """연결 실패(Ollama 꺼짐 등)는 AIUnavailable로 바꿔 503으로 응답하게 한다."""
    from openai import APIConnectionError, NotFoundError

    try:
        return client.chat.completions.create(model=settings.llm_model, **kwargs)
    except APIConnectionError as e:
        raise AIUnavailable("LLM 서버에 연결할 수 없어요. 터미널에서 `ollama serve`를 실행해 주세요.") from e
    except NotFoundError as e:
        raise AIUnavailable(f"모델 {settings.llm_model}이 없어요. `ollama pull {settings.llm_model}`") from e


def llm_status() -> str | None:
    """None이면 사용 가능. 아니면 사람이 읽을 수 있는 이유 (서버 꺼짐 / 모델 미설치)."""
    try:
        res = httpx.get(f"{settings.llm_base_url.rstrip('/')}/models", timeout=1.0,
                        headers={"Authorization": f"Bearer {settings.llm_api_key}"})
        res.raise_for_status()
    except httpx.HTTPError:
        return "로컬 모델 서버에 연결할 수 없어. 터미널에서 `ollama serve`를 실행해 줘."
    ids = {m.get("id") for m in res.json().get("data", [])}
    if settings.llm_model not in ids and f"{settings.llm_model}:latest" not in ids:
        return f"모델 {settings.llm_model}이 설치돼 있지 않아. `ollama pull {settings.llm_model}`"
    return None


def _calendar(now: datetime) -> str:
    """작은 로컬 모델은 '다음주 화요일' 같은 날짜 계산을 자주 틀린다 → 2주치 달력을 직접 준다."""
    week0 = now.date() - timedelta(days=now.weekday())  # 이번 주 월요일
    lines = []
    for i in range(15):
        d = now.date() + timedelta(days=i)
        week = ["이번주", "다음주", "다다음주"][(d - week0).days // 7]
        extra = {0: " = 오늘", 1: " = 내일", 2: " = 모레"}.get(i, "")
        if 1 <= i <= 6:  # 일요일에 "이번주 금요일"이라고 하면 보통 다가오는 금요일을 뜻한다
            extra += f" = 다가오는 {WEEKDAYS[d.weekday()]}요일"
        lines.append(f"{d.isoformat()} {week} {WEEKDAYS[d.weekday()]}요일{extra}")
    return "\n".join(lines)


def _pending_snapshot(db: Session, now: datetime) -> str:
    """남은 할 일을 프롬프트에 직접 넣어 '목록 조회 → 수정' 두 단계를 한 단계로 줄인다.
    마감 기준으로 미리 묶어 둔다: 작은 모델은 날짜 비교(오늘 마감인가?)를 자주 틀린다."""
    todos = todo_service.list_todos(db, done=False)[:30]
    if not todos:
        return "남은 할 일 없음"
    groups: dict[str, list[str]] = {"마감 지남": [], "오늘 마감": [], "내일 마감": [], "모레 마감": [],
                                    "그 뒤": [], "마감 없음": []}
    for t in todos:
        line = f"  - {t.title} [id={t.id}]"
        if not t.due_at:
            groups["마감 없음"].append(line)
            continue
        d = todo_service._aware(t.due_at)
        diff = (d.date() - now.date()).days
        key = "마감 지남" if d < now and diff < 0 else {0: "오늘 마감", 1: "내일 마감", 2: "모레 마감"}.get(diff, "그 뒤")
        groups[key].append(f"  - {t.title} ({d:%m-%d} {WEEKDAYS[d.weekday()]} {d:%H:%M}) [id={t.id}]")
    return "\n".join(f"{k}: " + ("없음" if not v else "\n" + "\n".join(v)) for k, v in groups.items())


HAN = re.compile(r"[\u4e00-\u9fff]")
CONTEXT_MARKERS = ("현재 시각:", "[달력]", "[지금 할 일]", "지금 할 일 목록:")


def _clean_reply(text: str) -> str:
    """작은 모델이 시스템 프롬프트의 달력·목록을 답변에 그대로 붙이는 경우 잘라낸다."""
    cut = min((i for i in (text.find(m) for m in CONTEXT_MARKERS) if i >= 0), default=len(text))
    han = HAN.search(text)  # qwen이 가끔 중국어로 새는 부분부터 버린다
    if han:
        cut = min(cut, han.start())
    kept = text[:cut]
    kept = re.sub(r"\s*[\[(]\s*(?:id\s*[:=]\s*)?\d{3,}\s*[\])]", "", kept)  # "(id: 3)", "[18940]"
    kept = re.sub(r"[<\[](마감 지남|오늘 마감|내일 마감|모레 마감|그 뒤|마감 없음)[>\]]", r"\1", kept)
    lines = [ln for ln in kept.splitlines() if "id=" not in ln]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _parse_dt(value: str | None) -> datetime | None:
    """'2026-11-16', '2026-11-16 15:00', '...T15:00:00+09:00', '...Z' 모두 허용.
    날짜만 오면 그날 23:59 (0시로 두면 하루가 시작하자마자 '지남'이 된다)."""
    if not value:
        return None
    value = value.strip()
    if len(value) == 10:
        value += "T23:59"
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=settings.tz)


def _fn(name: str, description: str, properties: dict, required: list[str] | None = None) -> dict:
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object", "properties": properties, "required": required or []},
    }}


TOOL_SCHEMAS = [
    _fn("list_todos", "할 일 목록을 조회한다.",
        {"include_done": {"type": "boolean", "description": "완료된 항목도 포함할지"}}),
    _fn("add_todo", "새 할 일을 추가한다.", {
        "title": {"type": "string"},
        "due_at": {"type": "string", "description": "마감 일시 ISO 8601, 없으면 생략"},
        "category": {"type": "string", "enum": ["공부", "일", "개인", "건강", "기타"]},
        "priority": {"type": "integer", "description": "사용자가 중요하다고 했을 때만 1, 나중에 해도 된다고 했을 때만 3. 그 외엔 생략"},
    }, ["title"]),
    _fn("update_todo", "할 일의 제목/마감/카테고리/우선순위를 수정한다. 바꿀 값만 보낸다.", {
        "todo_id": {"type": "integer"},
        "title": {"type": "string"},
        "due_at": {"type": "string"},
        "category": {"type": "string"},
        "priority": {"type": "integer"},
    }, ["todo_id"]),
    _fn("complete_todo", "할 일을 완료 처리한다.", {"todo_id": {"type": "integer"}}, ["todo_id"]),
    _fn("delete_todo", "할 일을 삭제한다.", {"todo_id": {"type": "integer"}}, ["todo_id"]),
]


PRIORITY_WORDS = re.compile(r"중요|급|긴급|나중|천천히|여유|우선")


def build_tools(db: Session, actions: list[str], allow_priority: bool = True) -> dict:
    """DB 세션에 바인딩된 도구 함수들 (이름 → callable).
    allow_priority=False면 모델이 임의로 고른 중요도를 무시한다 (사용자가 말하지 않았으면 보통)."""

    def _prio(priority) -> int | None:
        return min(max(int(priority), 1), 3) if priority and allow_priority else None

    def list_todos(include_done: bool = False) -> list[dict]:
        todos = todo_service.list_todos(db, None if include_done else False)
        return [
            {"id": t.id, "title": t.title, "due_at": t.due_at.isoformat() if t.due_at else None,
             "category": t.category, "priority": t.priority, "done": t.done}
            for t in todos
        ]

    def add_todo(title: str, due_at: str | None = None, category: str = "기타", priority: int = 2) -> dict:
        todo = todo_service.create_todo(
            db, TodoCreate(title=title, due_at=_parse_dt(due_at), category=category,
                           priority=_prio(priority) or 2))
        actions.append(f"추가: {todo.title}")
        return {"id": todo.id, "title": todo.title}

    def update_todo(todo_id: int, title: str | None = None, due_at: str | None = None,
                    category: str | None = None, priority: int | None = None) -> dict:
        patch = {k: v for k, v in {"title": title, "due_at": _parse_dt(due_at), "category": category,
                                   "priority": _prio(priority)}.items() if v}
        todo = todo_service.update_todo(db, todo_id, TodoUpdate(**patch))
        actions.append(f"수정: {todo.title}")
        return {"id": todo.id, "title": todo.title}

    def complete_todo(todo_id: int) -> dict:
        todo = todo_service.update_todo(db, todo_id, TodoUpdate(done=True))
        actions.append(f"완료: {todo.title}")
        return {"id": todo.id, "done": True}

    def delete_todo(todo_id: int) -> dict:
        title = todo_service.get_todo(db, todo_id).title
        todo_service.delete_todo(db, todo_id)
        actions.append(f"삭제: {title}")
        return {"id": todo_id, "deleted": True}

    return {f.__name__: f for f in (list_todos, add_todo, update_todo, complete_todo, delete_todo)}


def _run_tool(tools: dict, name: str, raw_args: str) -> str:
    """도구 실행 결과(또는 에러)를 JSON 문자열로 돌려준다. 에러도 LLM에게 알려 스스로 복구하게 한다."""
    fn = tools.get(name)
    if fn is None:
        return json.dumps({"error": f"unknown tool {name}"})
    try:
        return json.dumps(fn(**json.loads(raw_args or "{}")), ensure_ascii=False, default=str)
    except Exception as e:  # 404, 검증 오류 등
        detail = getattr(e, "detail", None) or str(e)
        return json.dumps({"error": detail}, ensure_ascii=False)


QUERY = re.compile(r"뭐\s?있|무슨 일|뭐야|알려\s?줘|보여\s?줘|목록|몇\s?개|남았|할 일은|일정은")
CHANGE = re.compile(r"추가|넣어|등록|완료|끝났|끝냈|했어|삭제|지워|빼|바꿔|수정|변경|옮겨|미뤄")


def is_query(message: str) -> bool:
    """'내일 뭐 있어?' 같은 조회. '뭐부터 해야 돼?'(추천)나 변경 요청은 LLM에게 넘긴다."""
    return bool(QUERY.search(message)) and not CHANGE.search(message) and "뭐부터" not in message


def answer_query(db: Session, message: str, now: datetime) -> str:
    """조회는 LLM 없이 DB로 답한다: 작은 모델은 목록을 빠뜨리거나 날짜를 섞어서 답했다."""
    pending = todo_service.list_todos(db, done=False)

    def local(t):
        return todo_service._aware(t.due_at)

    def item(t, with_date=False):
        if not t.due_at:
            return t.title
        d = local(t)
        return f"{t.title} ({d:%m/%d} {WEEKDAYS[d.weekday()]} {d:%H:%M})" if with_date else f"{t.title} {d:%H:%M}"

    days = [d for _, d in date_hints.resolve(message, now.date())]
    if days:
        lines = []
        for day in days:
            hits = [t for t in pending if t.due_at and local(t).date() == day]
            label = f"{day:%m/%d} {WEEKDAYS[day.weekday()]}요일"
            lines.append(f"{label}: " + (", ".join(item(t) for t in hits) if hits else "없어"))
        return "\n".join(lines)

    if not pending:
        return "남은 할 일이 없어."
    overdue = [t for t in pending if t.due_at and local(t) < now and local(t).date() < now.date()]
    rest = [t for t in pending if t not in overdue]
    lines = [f"남은 할 일 {len(pending)}개"]
    if overdue:
        lines.append("밀린 일: " + ", ".join(item(t, True) for t in overdue))
    lines += [f"- {item(t, True)}" for t in rest]
    return "\n".join(lines)


CLAIMS_CHANGE = re.compile(r"(추가|완료|삭제|변경|수정|바꿨|바꾸었|옮겼)")
NUDGE = "방금 도구를 호출하지 않고 말로만 답했어. 실제로 바꾸려면 반드시 도구를 호출해. 바꿀 게 없으면 그렇다고만 말해."


def chat(db: Session, message: str) -> tuple[str, list[str]]:
    """대화 기록은 넣지 않는다: 작은 모델은 기록 속 '추가했어' 답을 보고 도구 없이 말만 따라 한다.
    대신 매 요청마다 남은 할 일 스냅샷을 넣어 '그거 완료' 같은 지칭도 해결한다."""
    now = datetime.now(settings.tz)
    if is_query(message):
        reply = answer_query(db, message, now)
        db.add_all([ChatMessage(role="user", content=message), ChatMessage(role="assistant", content=reply)])
        db.commit()
        return reply, []

    client = _client()
    d1, d2 = now.date() + timedelta(days=1), now.date() + timedelta(days=2)
    system = (f"{SYSTEM_PROMPT}\n\n현재 시각: {now:%Y-%m-%d %H:%M} ({WEEKDAYS[now.weekday()]})\n"
              f"오늘={now.date()}, 내일={d1}, 모레={d2}\n"
              f"[달력]\n{_calendar(now)}\n\n[지금 할 일]\n{_pending_snapshot(db, now)}")
    hinted = f"{message}\n{date_hints.hint(message, now.date())}".strip()
    messages: list[dict] = [{"role": "system", "content": system}, {"role": "user", "content": hinted}]

    actions: list[str] = []
    tools = build_tools(db, actions, allow_priority=bool(PRIORITY_WORDS.search(message)))
    reply, nudged = "", False
    for _ in range(MAX_TOOL_ROUNDS):
        msg = _complete(client, messages=messages, tools=TOOL_SCHEMAS).choices[0].message
        if not msg.tool_calls:
            reply = (msg.content or "").strip()
            # 도구 호출 없이 "추가했어"라고만 하는 환각 → 한 번 다시 시킨다
            if not actions and not nudged and CLAIMS_CHANGE.search(reply):
                nudged = True
                messages += [{"role": "assistant", "content": reply}, {"role": "user", "content": NUDGE}]
                continue
            break
        messages.append({"role": "assistant", "content": msg.content or "",
                         "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            messages.append({"role": "tool", "tool_call_id": tc.id,
                             "content": _run_tool(tools, tc.function.name, tc.function.arguments)})

    reply = _clean_reply(reply)
    if not actions and CLAIMS_CHANGE.search(reply) and nudged:
        reply = "실제로 바꾼 건 없어. 조금 더 구체적으로 말해 줄래? (예: '치과 예약 완료')"
    reply = reply or ("처리했어." if actions else "무슨 말인지 잘 모르겠어. 다시 말해 줄래?")

    db.add_all([ChatMessage(role="user", content=message), ChatMessage(role="assistant", content=reply)])
    db.commit()
    return reply, actions


def generate_text(prompt: str) -> str:
    resp = _complete(_client(), messages=[{"role": "user", "content": prompt}])
    return (resp.choices[0].message.content or "").strip()
