export const CATEGORIES = ["공부", "일", "개인", "건강", "기타"];
const WEEKDAY = "일월화수목금토";

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayDiff = (d, now) => Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
const time = (d) => d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });

export function todayLabel(now = new Date()) {
  return `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY[now.getDay()]}요일`;
}

/** 목록에서 보여줄 마감 표기. 오늘 것은 시간만, 지난 것은 며칠 지났는지. */
export function dueText(iso, now = new Date()) {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff === 0) return time(d);
  if (diff === 1) return `내일 ${time(d)}`;
  if (diff < 0) return `${-diff}일 지남`;
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY[d.getDay()]}) ${time(d)}`;
}

/** 마감 기준으로 묶는다: 밀림 → 오늘 → 이후 → 날짜 없음. 완료는 따로. */
export function groupTodos(todos, now = new Date()) {
  const groups = { overdue: [], today: [], later: [], nodate: [], done: [] };
  for (const t of todos) {
    if (t.done) groups.done.push(t);
    else if (!t.due_at) groups.nodate.push(t);
    else {
      const d = new Date(t.due_at);
      if (d < now && dayDiff(d, now) < 0) groups.overdue.push(t);
      else if (dayDiff(d, now) === 0) groups.today.push(t);
      else groups.later.push(t);
    }
  }
  groups.done.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
  return groups;
}

// <input type="datetime-local"> 값 → 로컬 타임존 ISO
export function localInputToIso(value) {
  return value ? new Date(value).toISOString() : null;
}
