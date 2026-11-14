import { useState } from "react";
import { CATEGORIES, localInputToIso } from "../lib/format";

const initial = { title: "", due: "", category: "기타", priority: 2 };

export default function TodoForm({ onSubmit }) {
  const [form, setForm] = useState(initial);
  const [open, setOpen] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    await onSubmit({
      title: form.title.trim(),
      due_at: localInputToIso(form.due),
      category: form.category,
      priority: Number(form.priority),
    });
    setForm(initial);
  };

  return (
    <form onSubmit={submit} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
      <div className="flex gap-2">
        <input
          value={form.title}
          onChange={set("title")}
          onFocus={() => setOpen(true)}
          placeholder="+ 할 일 직접 추가"
          className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-sm outline-none placeholder:text-slate-400"
        />
        <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40" disabled={!form.title.trim()}>
          추가
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-2 text-xs">
          <input type="datetime-local" value={form.due} onChange={set("due")} className="rounded-md border border-slate-200 px-2 py-1" />
          <select value={form.category} onChange={set("category")} className="rounded-md border border-slate-200 px-2 py-1">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={form.priority} onChange={set("priority")} className="rounded-md border border-slate-200 px-2 py-1">
            <option value={1}>높음</option><option value={2}>보통</option><option value={3}>낮음</option>
          </select>
        </div>
      )}
    </form>
  );
}
