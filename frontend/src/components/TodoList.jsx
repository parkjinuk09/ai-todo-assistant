import { useState } from "react";
import { groupTodos } from "../lib/format";
import AddTodo from "./AddTodo";
import Briefing from "./Briefing";
import TodoRow from "./TodoRow";

const SECTIONS = [
  ["overdue", "밀린 일"],
  ["today", "오늘"],
  ["later", "다가오는 일"],
  ["nodate", "날짜 없음"],
];

function Section({ title, items, accent, ...handlers }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-4">
      <h3 className={`num text-[12px] font-semibold ${accent ? "text-accent" : "text-mute"}`}>
        {title} {items.length}
      </h3>
      <ul className="divide-y divide-line">
        {items.map((t) => <TodoRow key={t.id} todo={t} {...handlers} />)}
      </ul>
    </section>
  );
}

export default function TodoList({ todos, loading, error, clearError, onAdd, onToggle, onDelete }) {
  const [showDone, setShowDone] = useState(false);
  const g = groupTodos(todos);
  const pending = todos.length - g.done.length;
  const handlers = { onToggle, onDelete };

  return (
    <div>
      <AddTodo onSubmit={onAdd} />

      {error && (
        <p role="alert" className="mt-3 flex justify-between gap-3 border-l-2 border-accent pl-3 text-[13px] text-accent">
          {error}
          <button onClick={clearError} className="shrink-0 text-mute hover:text-ink">닫기</button>
        </p>
      )}

      <Briefing hasPending={pending > 0} />

      {loading && <p className="mt-6 text-mute">불러오는 중…</p>}
      {!loading && !error && pending === 0 && (
        <p className="mt-6 text-mute">
          남은 할 일이 없어. 위에 직접 적거나 채팅에 “내일 3시 치과 추가”처럼 말하면 돼.
        </p>
      )}

      {SECTIONS.map(([key, title]) => (
        <Section key={key} title={title} items={g[key]} accent={key === "overdue"} {...handlers} />
      ))}

      {g.done.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowDone((v) => !v)} className="num text-[12px] text-mute hover:text-ink">
            {showDone ? "완료 숨기기" : `완료 ${g.done.length}개 보기`}
          </button>
          {showDone && (
            <ul className="divide-y divide-line">
              {g.done.map((t) => <TodoRow key={t.id} todo={t} {...handlers} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
