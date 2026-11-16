import { useEffect, useRef, useState } from "react";
import { groupTodos, matches } from "../lib/format";
import AddTodo from "./AddTodo";
import Briefing from "./Briefing";
import TodoRow from "./TodoRow";

const SECTIONS = [
  ["overdue", "밀린 일"],
  ["today", "오늘"],
  ["later", "다가오는 일"],
  ["nodate", "날짜 없음"],
];

export function Group({ title, danger, children }) {
  return (
    <section className="mt-5">
      {title && <h3 className={`section-label num ${danger ? "!text-danger" : ""}`}>{title}</h3>}
      <ul className="group-box divide-y divide-line">{children}</ul>
    </section>
  );
}

export default function TodoList({ todos, loading, onAdd, onToggle, onDelete, onUpdate, onUndo }) {
  const [showDone, setShowDone] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const searchRef = useRef(null);
  const addRef = useRef(null);

  const searching = query.trim().length > 0;
  const shown = searching ? todos.filter((t) => matches(t, query)) : todos;
  const g = groupTodos(shown);
  const pending = todos.filter((t) => !t.done).length;
  const doneOpen = showDone || searching; // 검색할 때는 완료한 일도 같이 찾는다
  // 화면에 보이는 순서 (키보드 이동용)
  const order = [...SECTIONS.flatMap(([key]) => g[key]), ...(doneOpen ? g.done : [])];

  // 최신 값을 키 처리기에서 쓰기 위해 ref에 담아 둔다
  const live = useRef({});
  live.current = { order, selected, editingId, onToggle, onDelete, onUndo };

  useEffect(() => {
    const onKey = (e) => {
      const { order, selected, editingId, onToggle, onDelete, onUndo } = live.current;
      const el = e.target;
      const typing = el.closest?.("input, textarea, select, [contenteditable], [role=dialog], [role=listbox], [role=menu]");
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.code === "KeyF") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (cmd && e.code === "KeyZ" && !e.shiftKey && !typing) {
        if (onUndo?.()) e.preventDefault();
        return;
      }
      if (typing || cmd || e.altKey || editingId != null) return;
      const onButton = el.closest?.("button, a");
      const i = order.findIndex((t) => t.id === selected);
      const move = (to) => {
        e.preventDefault();
        if (order.length) setSelected(order[Math.max(0, Math.min(order.length - 1, to))].id);
      };
      if (e.key === "ArrowDown" || e.code === "KeyJ") return move(i + 1);
      if (e.key === "ArrowUp" || e.code === "KeyK") return move(i < 0 ? 0 : i - 1);
      if (e.code === "KeyN") { e.preventDefault(); return addRef.current?.focus(); }
      if (e.key === "/") { e.preventDefault(); return searchRef.current?.focus(); }
      if (e.key === "Escape") return setSelected(null);
      if (i < 0 || onButton) return; // 버튼에 포커스가 있으면 Space·Enter는 그 버튼의 것
      const todo = order[i];
      if (e.key === " ") { e.preventDefault(); onToggle(todo); }
      else if (e.key === "Enter") { e.preventDefault(); setEditingId(todo.id); }
      else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        setSelected((order[i + 1] || order[i - 1])?.id ?? null);
        onDelete(todo.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const row = (t) => (
    <TodoRow
      key={t.id}
      todo={t}
      onToggle={onToggle}
      onDelete={onDelete}
      onUpdate={onUpdate}
      selected={t.id === selected}
      onSelect={setSelected}
      editing={t.id === editingId}
      onEditing={(on) => setEditingId(on ? t.id : null)}
    />
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-end justify-between gap-3 px-1">
        <h1 className="text-[26px] font-bold leading-none tracking-tight">할 일</h1>
        <label className="field flex w-[190px] items-center gap-1.5 focus-within:shadow-[0_0_0_3px_rgb(0_122_255/0.35)]">
          <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-mute" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.2" /><path d="m10.2 10.2 3.3 3.3" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); e.target.blur(); } }}
            placeholder="검색"
            aria-label="할 일 검색"
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-mute [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </div>

      {!searching && <AddTodo onSubmit={onAdd} inputRef={addRef} />}
      {!searching && <Briefing hasPending={pending > 0} />}

      {loading && <p className="mt-8 text-center text-mute">불러오는 중…</p>}
      {!loading && !searching && pending === 0 && (
        <p className="mt-10 text-center text-mute">
          남은 할 일이 없어.
          <br />
          위에 직접 적거나 비서에게 “내일 3시 치과 추가”처럼 말하면 돼.
        </p>
      )}
      {searching && shown.length === 0 && <p className="mt-10 text-center text-mute">‘{query.trim()}’에 맞는 할 일이 없어.</p>}

      {SECTIONS.map(([key, title]) =>
        g[key].length > 0 && (
          <Group key={key} title={`${title} ${g[key].length}`} danger={key === "overdue"}>
            {g[key].map(row)}
          </Group>
        ))}

      {g.done.length > 0 && (
        <div className="mt-5">
          {searching ? (
            <h3 className="section-label num">완료 {g.done.length}</h3>
          ) : (
            <button onClick={() => setShowDone((v) => !v)} className="btn-plain num text-[12px]">
              {showDone ? "완료 숨기기" : `완료 ${g.done.length}개 보기`}
            </button>
          )}
          {doneOpen && <ul className="group-box mt-1 divide-y divide-line">{g.done.map(row)}</ul>}
        </div>
      )}

      {order.length > 0 && (
        <p className="num mt-6 hidden px-1 text-[11px] text-faint [@media(hover:hover)]:block">
          ↑↓ 이동 · Space 완료 · Enter 수정 · ⌫ 삭제 · N 새 할 일 · ⌘F 검색 · ⌘Z 되돌리기
        </p>
      )}
    </div>
  );
}
