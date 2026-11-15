import { dueText } from "../lib/format";

export default function TodoRow({ todo, onToggle, onDelete }) {
  const due = dueText(todo.due_at);
  const late = !todo.done && todo.due_at && new Date(todo.due_at) < new Date();

  return (
    <li className="group flex items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={() => onToggle(todo)}
        aria-label={`${todo.title} 완료`}
        className="mt-[5px] size-4 shrink-0 cursor-pointer accent-ink"
      />
      <div className="min-w-0 flex-1">
        <p className={todo.done ? "text-mute line-through" : ""}>
          {todo.priority === 1 && !todo.done && <span className="mr-1.5 text-[12px] font-semibold text-accent">중요</span>}
          {todo.title}
        </p>
        <p className="num text-[12px] text-mute">
          {due && <span className={late ? "font-medium text-accent" : ""}>{due}</span>}
          {due && " · "}
          {todo.category}
        </p>
      </div>
      <button
        onClick={() => onDelete(todo.id)}
        className="shrink-0 px-1 text-[12px] text-mute opacity-0 hover:text-accent focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        삭제
      </button>
    </li>
  );
}
