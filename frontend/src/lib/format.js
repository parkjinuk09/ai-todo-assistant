export const CATEGORIES = ["공부", "일", "개인", "건강", "기타"];

export const PRIORITY = {
  1: { label: "높음", dot: "bg-rose-500" },
  2: { label: "보통", dot: "bg-amber-400" },
  3: { label: "낮음", dot: "bg-slate-300" },
};

export function formatDue(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  const time = d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  const day =
    diff === 0 ? "오늘" : diff === 1 ? "내일" : diff === -1 ? "어제"
      : d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" });
  return { text: `${day} ${time}`, overdue: d < now };
}

// <input type="datetime-local"> 값 → 로컬 타임존 ISO
export function localInputToIso(value) {
  return value ? new Date(value).toISOString() : null;
}
