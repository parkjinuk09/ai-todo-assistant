import { useState } from "react";
import { CATEGORIES, localInputToIso } from "../lib/format";

const blank = (due = "") => ({ title: "", due, category: "기타", priority: 2 });

/** defaultDue: 캘린더에서 날짜를 고른 상태면 그 날 오전 9시로 채워 둔다 */
export default function AddTodo({ onSubmit, defaultDue = "", placeholder = "새로운 할 일" }) {
  const [form, setForm] = useState(() => blank(defaultDue));
  const [busy, setBusy] = useState(false);
  const [lastDefault, setLastDefault] = useState(defaultDue);
  if (defaultDue !== lastDefault) {
    setLastDefault(defaultDue);
    setForm((f) => ({ ...f, due: defaultDue }));
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const open = form.title.trim().length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!open || busy) return;
    setBusy(true);
    const ok = await onSubmit({
      title: form.title.trim(),
      due_at: localInputToIso(form.due),
      category: form.category,
      priority: Number(form.priority),
    });
    setBusy(false);
    if (ok) setForm(blank(defaultDue)); // 실패하면 입력한 내용을 그대로 둔다
  };

  return (
    <form onSubmit={submit} className="group-box">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-accent text-[13px] leading-none text-white">+</span>
        <input
          value={form.title}
          onChange={set("title")}
          placeholder={placeholder}
          maxLength={200}
          aria-label="할 일 제목"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-mute"
        />
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2 text-[12px]">
          <input type="datetime-local" value={form.due} onChange={set("due")} aria-label="마감" className="field num" />
          <select value={form.category} onChange={set("category")} aria-label="분류" className="field">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={form.priority} onChange={set("priority")} aria-label="중요도" className="field">
            <option value={1}>중요</option>
            <option value={2}>보통</option>
            <option value={3}>나중에</option>
          </select>
          <button disabled={busy} className="btn-primary ml-auto">{busy ? "추가 중" : "추가"}</button>
        </div>
      )}
    </form>
  );
}
