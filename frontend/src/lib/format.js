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
export function dueText(iso, now = new Date(), allDay = false) {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  const clock = allDay ? "" : ` ${time(d)}`; // 하루 종일이면 날짜만
  if (diff === 0) return allDay ? "오늘" : time(d);
  if (diff === 1) return `내일${clock}`;
  if (diff < 0) return `${-diff}일 지남`;
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY[d.getDay()]})${clock}`;
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

// ISO → <input type="datetime-local"> 값 (로컬 시간 'YYYY-MM-DDTHH:MM')
export function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 손으로 친 시간을 'HH:MM'으로. 못 알아보면 null.
 * "15:30", "1530", "15", "오후 3시", "오후 3시 30분", "3시 반", "오전 9:05"
 */
export function parseTime(text) {
  const t = (text || "").trim();
  if (!t) return null;
  const pm = /오후|pm/i.test(t);
  const am = /오전|am/i.test(t);
  const half = /반/.test(t);
  const nums = t.match(/\d+/g);
  if (!nums) return null;
  let h, m;
  if (nums.length === 1 && nums[0].length >= 3 && nums[0].length <= 4) {
    h = Number(nums[0].slice(0, -2));
    m = Number(nums[0].slice(-2));
  } else {
    h = Number(nums[0]);
    m = nums[1] ? Number(nums[1]) : half ? 30 : 0;
  }
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

export const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c, color: CATEGORY_COLOR[c] }));
export const PRIORITY_OPTIONS = [
  { value: 1, label: "중요", color: "var(--color-danger)" },
  { value: 2, label: "보통" },
  { value: 3, label: "나중에" },
];

export const REPEAT_OPTIONS = [
  { value: "", label: "반복 안 함" },
  { value: "daily", label: "매일" },
  { value: "weekdays", label: "평일마다" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" },
];
export const REPEAT_LABEL = Object.fromEntries(REPEAT_OPTIONS.map((o) => [o.value, o.label]));

/** 마감 고르기 값: 하루 종일이면 'YYYY-MM-DD', 시간이 있으면 'YYYY-MM-DDTHH:MM', 없으면 "" */
export function dueToInput(todo) {
  if (!todo.due_at) return "";
  return todo.all_day ? ymd(new Date(todo.due_at)) : isoToLocalInput(todo.due_at);
}

/** 마감 고르기 값 → 서버에 보낼 { due_at, all_day } */
export function inputToDue(value) {
  if (!value) return { due_at: null, all_day: false };
  if (value.includes("T")) return { due_at: new Date(value).toISOString(), all_day: false };
  const [y, m, d] = value.split("-").map(Number);
  return { due_at: new Date(y, m - 1, d, 23, 59).toISOString(), all_day: true };
}

/** 미루기 선택지: [{ label, hint, body }] */
export function snoozeOptions(todo, now = new Date()) {
  const at = (h) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0);
  const day = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  // 날짜만 옮기고 시간은 그대로. 마감이 없던 일은 하루 종일로
  const keep = (d) =>
    todo.due_at ? { due_at: moveToDay(todo.due_at, ymd(d)), all_day: !!todo.all_day } : inputToDue(ymd(d));
  const label = (d) => `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY[d.getDay()]})`;
  const out = [];
  if (now.getHours() < 18) out.push({ label: "오늘 저녁", hint: "오후 6시", body: { due_at: at(18).toISOString(), all_day: false } });
  else if (now.getHours() < 21) out.push({ label: "오늘 밤", hint: "오후 9시", body: { due_at: at(21).toISOString(), all_day: false } });
  const tomorrow = day(1);
  const monday = day(((8 - now.getDay()) % 7) || 7);
  out.push({ label: "내일", hint: label(tomorrow), body: keep(tomorrow) });
  out.push({ label: "다음 주", hint: label(monday), body: keep(monday) });
  return out;
}

/** 검색: 제목·메모·하위 항목에서 찾는다 */
export function matches(todo, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [todo.title, todo.note, ...(todo.subtasks || []).map((s) => s.title)]
    .some((text) => (text || "").toLowerCase().includes(q));
}
