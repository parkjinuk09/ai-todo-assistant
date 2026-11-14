import { useState } from "react";
import BriefingCard from "./BriefingCard";
import TodoForm from "./TodoForm";
import TodoItem from "./TodoItem";

const FILTERS = { pending: "할 일", done: "완료", all: "전체" };

export default function TodoPanel({ todos, loading, error, onAdd, onToggle, onDelete }) {
  const [filter, setFilter] = useState("pending");
  const visible = todos.filter((t) => (filter === "all" ? true : filter === "done" ? t.done : !t.done));
  const pendingCount = todos.filter((t) => !t.done).length;

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <BriefingCard />
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">📋 할 일 <span className="text-sm font-normal text-slate-400">{pendingCount}개 남음</span></h2>
        <div className="flex rounded-lg bg-slate-200/60 p-0.5 text-xs">
          {Object.entries(FILTERS).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`rounded-md px-2.5 py-1 ${filter === key ? "bg-white font-medium shadow-sm" : "text-slate-500"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <TodoForm onSubmit={onAdd} />
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
        {loading && <li className="text-sm text-slate-400">불러오는 중…</li>}
        {!loading && visible.length === 0 && (
          <li className="py-10 text-center text-sm text-slate-400">비어 있어요. 오른쪽 비서에게 말로 추가해 보세요 ✨</li>
        )}
        {visible.map((t) => <TodoItem key={t.id} todo={t} onToggle={onToggle} onDelete={onDelete} />)}
      </ul>
    </section>
  );
}
