import { CATEGORY_COLOR, dueText, isLate, time } from "../lib/format";

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

/** onlyTime: 캘린더 하루 보기처럼 날짜가 이미 정해진 곳에서는 시간만 */
export default function TodoRow({ todo, onToggle, onDelete, onlyTime = false }) {
  const late = isLate(todo);
  const due = todo.due_at && (onlyTime ? time(new Date(todo.due_at)) : dueText(todo.due_at));

  return (
    <li className="group flex items-start gap-3 px-3 py-2.5">
      <Check done={todo.done} onClick={() => onToggle(todo)} label={`${todo.title} 완료`} />
      <div className="min-w-0 flex-1">
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
      <button
        onClick={() => onDelete(todo.id)}
        aria-label={`${todo.title} 삭제`}
        className="btn-plain shrink-0 text-[11.5px] opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
      >
        삭제
      </button>
    </li>
  );
}
