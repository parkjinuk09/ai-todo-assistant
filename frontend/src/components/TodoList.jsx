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

export function Group({ title, danger, children }) {
  return (
    <section className="mt-5">
      {title && <h3 className={`section-label num ${danger ? "!text-danger" : ""}`}>{title}</h3>}
      <ul className="group-box divide-y divide-line">{children}</ul>
    </section>
  );
}

export default function TodoList({ todos, loading, onAdd, onToggle, onDelete }) {
  const [showDone, setShowDone] = useState(false);
  const g = groupTodos(todos);
  const pending = todos.length - g.done.length;
  const handlers = { onToggle, onDelete };

  return (
    <div className="mx-auto max-w-2xl">
      <AddTodo onSubmit={onAdd} />
      <Briefing hasPending={pending > 0} />

      {loading && <p className="mt-8 text-center text-mute">불러오는 중…</p>}
      {!loading && pending === 0 && (
        <p className="mt-10 text-center text-mute">
          남은 할 일이 없어.
          <br />
          위에 직접 적거나 비서에게 “내일 3시 치과 추가”처럼 말하면 돼.
        </p>
      )}

      {SECTIONS.map(([key, title]) =>
        g[key].length > 0 && (
          <Group key={key} title={`${title} ${g[key].length}`} danger={key === "overdue"}>
            {g[key].map((t) => <TodoRow key={t.id} todo={t} {...handlers} />)}
          </Group>
        ))}

      {g.done.length > 0 && (
        <div className="mt-5">
          <button onClick={() => setShowDone((v) => !v)} className="btn-plain num text-[12px]">
            {showDone ? "완료 숨기기" : `완료 ${g.done.length}개 보기`}
          </button>
          {showDone && (
            <ul className="group-box mt-1 divide-y divide-line">
              {g.done.map((t) => <TodoRow key={t.id} todo={t} {...handlers} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
