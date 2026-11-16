import { useState } from "react";
import { CATEGORY_OPTIONS, PRIORITY_OPTIONS, REPEAT_OPTIONS, inputToDue } from "../lib/format";
import { DuePicker, Select } from "./Pickers";

const blank = (due = "") => ({ title: "", due, category: "기타", priority: 2, repeat: "" });

/** defaultDue: 캘린더에서 날짜를 고른 상태면 그 날(하루 종일)로 채워 둔다 */
export default function AddTodo({ onSubmit, defaultDue = "", placeholder = "새로운 할 일", inputRef }) {
  const [form, setForm] = useState(() => blank(defaultDue));
  const [busy, setBusy] = useState(false);
  const [lastDefault, setLastDefault] = useState(defaultDue);
  if (defaultDue !== lastDefault) {
    setLastDefault(defaultDue);
    setForm((f) => ({ ...f, due: defaultDue }));
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pick = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const open = form.title.trim().length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!open || busy) return;
    setBusy(true);
    const ok = await onSubmit({
      title: form.title.trim(),
      ...inputToDue(form.due),
      category: form.category,
      priority: Number(form.priority),
      repeat: form.repeat || null,
    });
    setBusy(false);
    if (ok) setForm(blank(defaultDue)); // 실패하면 입력한 내용을 그대로 둔다
  };

  return (
    <form onSubmit={submit} className="group-box">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-accent text-[13px] leading-none text-white">+</span>
        <input
          ref={inputRef}
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
          <DuePicker value={form.due} onChange={pick("due")} />
          <Select label="반복" value={form.repeat} onChange={pick("repeat")} options={REPEAT_OPTIONS} />
          <Select label="분류" value={form.category} onChange={pick("category")} options={CATEGORY_OPTIONS} />
          <Select label="중요도" value={form.priority} onChange={pick("priority")} options={PRIORITY_OPTIONS} />
          <button disabled={busy} className="btn-primary ml-auto">{busy ? "추가 중" : "추가"}</button>
        </div>
      )}
    </form>
  );
}
