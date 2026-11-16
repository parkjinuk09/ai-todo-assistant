import { useEffect, useRef, useState } from "react";
import {
  CATEGORY_COLOR, CATEGORY_OPTIONS, PRIORITY_OPTIONS, REPEAT_LABEL, REPEAT_OPTIONS,
  dueText, dueToInput, inputToDue, isLate, snoozeOptions, time,
} from "../lib/format";
import { DuePicker, Menu, Select } from "./Pickers";

/** 미리알림 앱처럼 동그란 체크 */
export function Check({ done, onClick, label, small = false }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onClick}
      className={`grid shrink-0 place-items-center rounded-full border-[1.5px] transition-colors ${
        small ? "size-[14px]" : "mt-[1px] size-[18px]"
      } ${done ? "border-accent bg-accent" : "border-faint hover:border-mute"}`}
    >
      {done && (
        <svg viewBox="0 0 12 12" className={`${small ? "size-2" : "size-2.5"} text-white`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2 5 8.5l4.5-5" />
        </svg>
      )}
    </button>
  );
}

const RepeatIcon = () => (
  <svg viewBox="0 0 12 12" className="size-[10px]" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 5.2A4 4 0 0 1 9.3 3.6M10 6.8a4 4 0 0 1-7.3 1.6M9.6 1.6v2.2H7.4M2.4 10.4V8.2h2.2" />
  </svg>
);

/** 한 줄 안에서 바로 고치는 폼. Enter 저장, Esc 취소 */
function EditForm({ todo, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: todo.title,
    due: dueToInput(todo),
    category: todo.category,
    priority: todo.priority,
    repeat: todo.repeat || "",
    note: todo.note || "",
    subtasks: todo.subtasks || [],
  });
  const [draft, setDraft] = useState(""); // 새 하위 항목
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pick = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setSub = (i, title) => setForm((f) => ({ ...f, subtasks: f.subtasks.map((s, j) => (j === i ? { ...s, title } : s)) }));
  const dropSub = (i) => setForm((f) => ({ ...f, subtasks: f.subtasks.filter((_, j) => j !== i) }));
  const addSub = () => {
    const title = draft.trim();
    if (!title) return false;
    setForm((f) => ({ ...f, subtasks: [...f.subtasks, { title, done: false }] }));
    setDraft("");
    return true;
  };

  const submit = async (e) => {
    e?.preventDefault();
    const title = form.title.trim();
    if (!title || busy) return;
    // 적다 만 하위 항목도 같이 저장하고, 빈 줄은 버린다
    const subtasks = [...form.subtasks, ...(draft.trim() ? [{ title: draft.trim(), done: false }] : [])]
      .map((s) => ({ ...s, title: s.title.trim() }))
      .filter((s) => s.title);
    // 바뀐 것만 보낸다
    const body = {};
    if (title !== todo.title) body.title = title;
    if (form.due !== dueToInput(todo)) Object.assign(body, inputToDue(form.due));
    if (form.category !== todo.category) body.category = form.category;
    if (Number(form.priority) !== todo.priority) body.priority = Number(form.priority);
    if (form.repeat !== (todo.repeat || "")) body.repeat = form.repeat || null;
    if (form.note.trim() !== (todo.note || "")) body.note = form.note.trim();
    if (JSON.stringify(subtasks) !== JSON.stringify(todo.subtasks || [])) body.subtasks = subtasks;
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
        <textarea
          value={form.note}
          onChange={set("note")}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e); }}
          rows={2}
          maxLength={2000}
          placeholder="메모 (링크, 준비물 등)"
          aria-label="메모"
          className="field w-full resize-none text-[12px] placeholder:text-mute"
        />
        <ul className="flex flex-col gap-1">
          {form.subtasks.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="size-[14px] shrink-0 rounded-full border-[1.5px] border-faint" />
              <input value={s.title} onChange={(e) => setSub(i, e.target.value)} maxLength={200} aria-label={`하위 항목 ${i + 1}`} className="field min-w-0 flex-1 text-[12px]" />
              <button type="button" onClick={() => dropSub(i)} aria-label={`하위 항목 ${i + 1} 지우기`} className="btn-plain !px-1.5 text-[12px]">×</button>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="grid size-[14px] shrink-0 place-items-center text-[13px] leading-none text-mute">+</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // 내용이 있으면 Enter로 항목 추가, 비어 있으면 그대로 저장
                if (e.key === "Enter" && !e.nativeEvent.isComposing && draft.trim()) {
                  e.preventDefault();
                  addSub();
                }
              }}
              maxLength={200}
              placeholder="하위 항목 추가"
              aria-label="하위 항목 추가"
              className="field min-w-0 flex-1 text-[12px] placeholder:text-mute"
            />
          </li>
        </ul>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <DuePicker value={form.due} onChange={pick("due")} />
          <Select label="반복" value={form.repeat} onChange={pick("repeat")} options={REPEAT_OPTIONS} />
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

/**
 * onlyTime: 캘린더 하루 보기처럼 날짜가 이미 정해진 곳에서는 시간만.
 * selected / editing / onEditing: 목록이 키보드로 조작할 때 넘긴다 (안 넘기면 줄이 스스로 관리).
 */
export default function TodoRow({ todo, onToggle, onDelete, onUpdate, onlyTime = false, selected = false, onSelect, editing, onEditing }) {
  const [localEditing, setLocalEditing] = useState(false);
  const isEditing = editing ?? localEditing;
  const setEditing = onEditing ?? setLocalEditing;
  const ref = useRef(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (isEditing && onUpdate) return <EditForm todo={todo} onSave={onUpdate} onCancel={() => setEditing(false)} />;

  const late = isLate(todo);
  const hidden = "opacity-0 group-hover:opacity-100 focus:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100";
  const due = todo.due_at && (onlyTime ? (todo.all_day ? null : time(new Date(todo.due_at))) : dueText(todo.due_at, new Date(), todo.all_day));
  const subs = todo.subtasks || [];
  const subsDone = subs.filter((s) => s.done).length;
  const toggleSub = (i) => onUpdate(todo.id, { subtasks: subs.map((s, j) => (j === i ? { ...s, done: !s.done } : s)) });

  return (
    <li ref={ref} onClick={() => onSelect?.(todo.id)} className={`group flex items-start gap-3 px-3 py-2.5 first:rounded-t-[10px] last:rounded-b-[10px] ${selected ? "bg-selected" : ""}`}>
      <Check done={todo.done} onClick={() => onToggle(todo)} label={`${todo.title} 완료`} />
      {/* 제목을 두 번 눌러도 수정 */}
      <div className="min-w-0 flex-1" onDoubleClick={() => onUpdate && setEditing(true)}>
        <p className={`leading-[1.35] ${todo.done ? "text-mute line-through decoration-faint" : ""}`}>
          {todo.priority === 1 && !todo.done && <span className="mr-1 font-semibold text-danger">!</span>}
          {todo.title}
        </p>
        <p className="num mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-mute">
          <span className="size-1.5 rounded-full" style={{ background: CATEGORY_COLOR[todo.category] }} />
          {todo.category}
          {due && <span className={late ? "text-danger" : ""}>· {due}</span>}
          {todo.repeat && <span className="flex items-center gap-1">· <RepeatIcon />{REPEAT_LABEL[todo.repeat]}</span>}
          {subs.length > 0 && <span>· {subsDone}/{subs.length}</span>}
        </p>
        {todo.note && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[12px] text-mute">{todo.note}</p>}
        {subs.length > 0 && !todo.done && (
          <ul className="mt-1.5 flex flex-col gap-1">
            {subs.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-[12px]">
                <Check small done={s.done} onClick={() => onUpdate && toggleSub(i)} label={`${s.title} 완료`} />
                <span className={s.done ? "text-mute line-through decoration-faint" : ""}>{s.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0">
        {onUpdate && !todo.done && (
          <Menu
            label={`${todo.title} 미루기`}
            align="right"
            className={`btn-plain text-[11.5px] ${hidden}`}
            items={snoozeOptions(todo).map((o) => ({ label: o.label, hint: o.hint, onSelect: () => onUpdate(todo.id, o.body) }))}
          >
            미루기
          </Menu>
        )}
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
