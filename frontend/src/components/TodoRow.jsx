import { useState } from "react";
import { CATEGORY_COLOR, CATEGORY_OPTIONS, PRIORITY_OPTIONS, dueText, isLate, isoToLocalInput, localInputToIso, time } from "../lib/format";
import { DuePicker, Select } from "./Pickers";

/** 미리알림 앱처럼 동그란 체크 */
export function Check({ done, onClick, label }) {
  return (
    <button
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onClick}
      className={`mt-[1px] grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors ${
        done ? "border-accent bg-accent" : "border-faint hover:border-mute"
      }`}
    >
      {done && (
        <svg viewBox="0 0 12 12" className="size-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2 5 8.5l4.5-5" />
        </svg>
      )}
    </button>
  );
}

/** 한 줄 안에서 바로 고치는 폼. Enter 저장, Esc 취소 */
function EditForm({ todo, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: todo.title,
    due: isoToLocalInput(todo.due_at),
    category: todo.category,
    priority: todo.priority,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pick = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title || busy) return;
    // 바뀐 것만 보낸다
    const body = {};
    if (title !== todo.title) body.title = title;
    if (form.due !== isoToLocalInput(todo.due_at)) body.due_at = localInputToIso(form.due);
    if (form.category !== todo.category) body.category = form.category;
    if (Number(form.priority) !== todo.priority) body.priority = Number(form.priority);
    if (Object.keys(body).length === 0) return onCancel();
    setBusy(true);
    const ok = await onSave(todo.id, body);
    setBusy(false);
    if (ok) onCancel(); // 실패하면 폼을 그대로 둔다 (에러는 위쪽 알림에 표시)
  };

  return (
    <li className="px-3 py-2.5">
      <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onCancel()} className="flex flex-col gap-2">
        <input
          autoFocus
          onFocus={(e) => e.target.select()}
          value={form.title}
          onChange={set("title")}
          maxLength={200}
          aria-label="할 일 제목"
          className="field w-full"
        />
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <DuePicker value={form.due} onChange={pick("due")} />
          <Select label="분류" value={form.category} onChange={pick("category")} options={CATEGORY_OPTIONS} />
          <Select label="중요도" value={form.priority} onChange={pick("priority")} options={PRIORITY_OPTIONS} />
          <span className="ml-auto flex gap-1">
            <button type="button" onClick={onCancel} className="btn-plain">취소</button>
            <button disabled={!form.title.trim() || busy} className="btn-primary">{busy ? "저장 중" : "저장"}</button>
          </span>
        </div>
      </form>
    </li>
  );
}

/** onlyTime: 캘린더 하루 보기처럼 날짜가 이미 정해진 곳에서는 시간만 */
export default function TodoRow({ todo, onToggle, onDelete, onUpdate, onlyTime = false }) {
  const [editing, setEditing] = useState(false);
  const late = isLate(todo);
  if (editing) return <EditForm todo={todo} onSave={onUpdate} onCancel={() => setEditing(false)} />;
  const hidden = "opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100";
  const due = todo.due_at && (onlyTime ? time(new Date(todo.due_at)) : dueText(todo.due_at));

  return (
    <li className="group flex items-start gap-3 px-3 py-2.5">
      <Check done={todo.done} onClick={() => onToggle(todo)} label={`${todo.title} 완료`} />
      {/* 제목을 두 번 눌러도 수정 */}
      <div className="min-w-0 flex-1" onDoubleClick={() => onUpdate && setEditing(true)}>
        <p className={`leading-[1.35] ${todo.done ? "text-mute line-through decoration-faint" : ""}`}>
          {todo.priority === 1 && !todo.done && <span className="mr-1 font-semibold text-danger">!</span>}
          {todo.title}
        </p>
        <p className="num mt-0.5 flex items-center gap-1.5 text-[11.5px] text-mute">
          <span className="size-1.5 rounded-full" style={{ background: CATEGORY_COLOR[todo.category] }} />
          {todo.category}
          {due && <span className={late ? "text-danger" : ""}>· {due}</span>}
        </p>
      </div>
      <div className="flex shrink-0">
        {onUpdate && (
          <button onClick={() => setEditing(true)} aria-label={`${todo.title} 수정`} className={`btn-plain text-[11.5px] ${hidden}`}>
            수정
          </button>
        )}
        <button onClick={() => onDelete(todo.id)} aria-label={`${todo.title} 삭제`} className={`btn-plain text-[11.5px] ${hidden}`}>
          삭제
        </button>
      </div>
    </li>
  );
}
