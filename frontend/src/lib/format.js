export const CATEGORIES = ["공부", "일", "개인", "건강", "기타"];
export const CATEGORY_COLOR = {
  공부: "var(--color-c-study)",
  일: "var(--color-c-work)",
  개인: "var(--color-c-personal)",
  건강: "var(--color-c-health)",
  기타: "var(--color-c-etc)",
};
export const WEEKDAY = "일월화수목금토";

const pad = (n) => String(n).padStart(2, "0");
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayDiff = (d, now) => Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
export const time = (d) => d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });

/** 로컬 기준 'YYYY-MM-DD' */
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

export const isLate = (t, now = new Date()) => !t.done && !!t.due_at && new Date(t.due_at) < now;

/** 마감 기준으로 묶는다: 밀림 → 오늘 → 이후 → 날짜 없음. 완료는 따로. */
export function groupTodos(todos, now = new Date()) {
  const groups = { overdue: [], today: [], later: [], nodate: [], done: [] };
  for (const t of todos) {
    if (t.done) groups.done.push(t);
    else if (!t.due_at) groups.nodate.push(t);
    else {
      const diff = dayDiff(new Date(t.due_at), now);
      if (diff < 0) groups.overdue.push(t);
      else if (diff === 0) groups.today.push(t);
      else groups.later.push(t);
    }
  }
  const byDue = (a, b) => a.due_at.localeCompare(b.due_at);
  groups.overdue.sort(byDue);
  groups.today.sort(byDue);
  groups.later.sort(byDue);
  groups.done.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
  return groups;
}

/** 'YYYY-MM' 달의 6주 x 7일 칸 (일요일 시작) */
export function monthGrid(month) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date: d, key: ymd(d), inMonth: d.getMonth() === m - 1 };
  });
}

/** 날짜('YYYY-MM-DD')별 할 일. 하루 안에서는 시간순. */
export function byDay(todos) {
  const map = {};
  for (const t of todos) {
    if (!t.due_at) continue;
    (map[ymd(new Date(t.due_at))] ||= []).push(t);
  }
  for (const k in map) map[k].sort((a, b) => a.due_at.localeCompare(b.due_at));
  return map;
}

/** 시간은 그대로 두고 날짜만 바꾼 ISO */
export function moveToDay(iso, dayKey) {
  const old = new Date(iso);
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, old.getHours(), old.getMinutes()).toISOString();
}

// <input type="datetime-local"> 값 → 로컬 타임존 ISO
export function localInputToIso(value) {
  return value ? new Date(value).toISOString() : null;
}
