import { useState } from "react";
import CalendarView from "./components/CalendarView";
import ChatPane from "./components/ChatPane";
import ReportView from "./components/ReportView";
import TodoList from "./components/TodoList";
import { useChat } from "./hooks/useChat";
import { useHealth } from "./hooks/useHealth";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { useTodos } from "./hooks/useTodos";
import { groupTodos, todayLabel } from "./lib/format";

const icon = {
  todos: <><circle cx="4" cy="5" r="1.4" /><circle cx="4" cy="11" r="1.4" /><path d="M8 5h6M8 11h6" /></>,
  calendar: <><rect x="2.2" y="3" width="11.6" height="11" rx="2.2" /><path d="M2.2 6.6h11.6M5.5 1.6v2.6M10.5 1.6v2.6" /></>,
  report: <path d="M3 13.5V8.5M8 13.5v-11M13 13.5v-6" />,
  chat: <path d="M3 3.5h10a1.2 1.2 0 0 1 1.2 1.2v6a1.2 1.2 0 0 1-1.2 1.2H7l-3 2.4v-2.4H3a1.2 1.2 0 0 1-1.2-1.2v-6A1.2 1.2 0 0 1 3 3.5Z" />,
};

function NavItem({ id, label, count, current, onSelect, className = "" }) {
  const active = current === id;
  return (
    <button
      onClick={() => onSelect(id)}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-[5px] text-left ${
        active ? "bg-selected font-medium" : "hover:bg-hover"
      } ${className}`}
    >
      <svg viewBox="0 0 16 16" className={`size-4 ${active ? "text-accent" : "text-mute"}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {icon[id]}
      </svg>
      <span className="flex-1">{label}</span>
      {count > 0 && <span className="num hidden text-[12px] text-mute md:inline">{count}</span>}
    </button>
  );
}

export default function App() {
  const [view, setView] = useState("todos");
  const todo = useTodos();
  const chat = useChat({ onTodosChanged: todo.setTodos });
  const health = useHealth();
  const { canInstall, install } = useInstallPrompt();

  const g = groupTodos(todo.todos);
  const pending = todo.todos.length - g.done.length;
  const nav = { current: view, onSelect: setView };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* 사이드바 */}
      <aside className="app-sidebar flex shrink-0 flex-col border-line bg-sidebar backdrop-blur-2xl backdrop-saturate-150 max-md:border-b md:w-[212px] md:border-r">
        <div className="px-4 pb-2 pt-4 md:pt-6">
          <p className="text-[11px] font-medium text-mute">오늘</p>
          <p className="num text-[15px] font-semibold">{todayLabel()}</p>
        </div>
        <nav className="flex gap-0.5 overflow-x-auto px-2 pb-2 md:flex-col">
          <NavItem id="todos" label="할 일" count={pending} {...nav} />
          <NavItem id="calendar" label="캘린더" count={g.today.length} {...nav} />
          <NavItem id="report" label="월간 기록" {...nav} />
          <NavItem id="chat" label="비서" {...nav} className="xl:hidden" />
        </nav>
        {g.overdue.length > 0 && (
          <button onClick={() => setView("todos")} className="mx-4 hidden text-left text-[12px] text-danger md:block">
            밀린 일 {g.overdue.length}개
          </button>
        )}
        {canInstall && (
          <button onClick={install} className="btn-plain mx-2 mb-3 mt-auto hidden text-left text-[12px] md:block">
            Dock에 앱으로 설치
          </button>
        )}
      </aside>

      {/* 본문 */}
      <main className="min-h-0 flex-1 overflow-y-auto bg-surface backdrop-blur-2xl">
        <div className="px-5 pb-10 pt-6 md:px-8">
          {todo.error && (
            <p role="alert" className="group-box mx-auto mb-4 flex max-w-2xl items-center justify-between gap-3 px-3 py-2 text-danger">
              {todo.error}
              <button onClick={todo.clearError} className="btn-plain shrink-0 text-[12px]">닫기</button>
            </p>
          )}
          {view === "todos" && (
            <>
              <h1 className="mx-auto mb-4 max-w-2xl px-1 text-[26px] font-bold leading-none tracking-tight">할 일</h1>
              <TodoList todos={todo.todos} loading={todo.loading} onAdd={todo.add} onToggle={todo.toggle} onDelete={todo.remove} />
            </>
          )}
          {view === "calendar" && (
            <CalendarView todos={todo.todos} onAdd={todo.add} onToggle={todo.toggle} onDelete={todo.remove} onUpdate={todo.update} />
          )}
          {view === "report" && <ReportView />}
          {view === "chat" && (
            <div className="group-box mx-auto h-[70vh] max-w-2xl overflow-hidden xl:hidden">
              <ChatPane messages={chat.messages} sending={chat.sending} onSend={chat.send} health={health} />
            </div>
          )}
        </div>
      </main>

      {/* 비서 (1280px 이상에서는 항상 옆에) */}
      <aside className="hidden w-[320px] shrink-0 border-l border-line bg-sidebar backdrop-blur-2xl backdrop-saturate-150 xl:block">
        <ChatPane messages={chat.messages} sending={chat.sending} onSend={chat.send} health={health} />
      </aside>
    </div>
  );
}
