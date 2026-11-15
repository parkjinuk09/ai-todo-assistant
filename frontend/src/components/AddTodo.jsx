import { useState } from "react";
import { CATEGORIES, localInputToIso } from "../lib/format";

const initial = { title: "", due: "", category: "기타", priority: 2 };
const field = "rounded border border-line bg-white px-2 py-1 text-[13px]";

export default function AddTodo({ onSubmit }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || busy) return;
    setBusy(true);
    const ok = await onSubmit({
      title: form.title.trim(),
      due_at: localInputToIso(form.due),
      category: form.category,
      priority: Number(form.priority),
    });
    setBusy(false);
    if (ok) setForm(initial); // 실패하면 입력한 내용을 그대로 둔다
  };

  return (
    <form onSubmit={submit} className="border-b border-line pb-3">
      <input
        value={form.title}
        onChange={set("title")}
        placeholder="할 일 입력 후 Enter"
        maxLength={200}
        aria-label="할 일 제목"
        className="w-full bg-transparent py-1.5 text-[15px] outline-none placeholder:text-mute"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input type="datetime-local" value={form.due} onChange={set("due")} aria-label="마감" className={`${field} num`} />
        <select value={form.category} onChange={set("category")} aria-label="분류" className={field}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={form.priority} onChange={set("priority")} aria-label="중요도" className={field}>
          <option value={1}>중요</option>
          <option value={2}>보통</option>
          <option value={3}>나중에</option>
        </select>
        <button
          disabled={!form.title.trim() || busy}
          className="ml-auto rounded bg-ink px-3 py-1 text-[13px] font-medium text-paper disabled:opacity-30"
        >
          {busy ? "추가 중" : "추가"}
        </button>
      </div>
    </form>
  );
}
