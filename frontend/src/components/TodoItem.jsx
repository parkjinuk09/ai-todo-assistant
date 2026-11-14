import { PRIORITY, formatDue } from "../lib/format";

export default function TodoItem({ todo, onToggle, onDelete }) {
  const due = formatDue(todo.due_at);
  return (
    <li className="group flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100 transition hover:ring-indigo-200">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={() => onToggle(todo)}
        className="size-5 shrink-0 cursor-pointer accent-indigo-600"
      />
      <span className={`size-2 shrink-0 rounded-full ${PRIORITY[todo.priority]?.dot}`} title={`우선순위 ${PRIORITY[todo.priority]?.label}`} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${todo.done ? "text-slate-400 line-through" : ""}`}>{todo.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
          <span className="rounded bg-slate-100 px-1.5 py-0.5">{todo.category}</span>
          {due && <span className={due.overdue && !todo.done ? "font-medium text-rose-500" : ""}>{due.text}</span>}
        </div>
      </div>
      <button
        onClick={() => onDelete(todo.id)}
        className="rounded-md px-2 py-1 text-xs text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
        aria-label="삭제"
      >
        삭제
      </button>
    </li>
  );
}
