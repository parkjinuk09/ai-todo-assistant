import { useState } from "react";
import ChatPane from "./components/ChatPane";
import ReportView from "./components/ReportView";
import TodoList from "./components/TodoList";
import { useChat } from "./hooks/useChat";
import { useHealth } from "./hooks/useHealth";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { useTodos } from "./hooks/useTodos";
import { todayLabel } from "./lib/format";

const TABS = [["todos", "할 일"], ["report", "월간 기록"]];

export default function App() {
  const [tab, setTab] = useState("todos");
  const todo = useTodos();
  const chat = useChat({ onTodosChanged: todo.setTodos });
  const health = useHealth();
  const { canInstall, install } = useInstallPrompt();

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 md:h-full md:px-8">
      <header className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-ink py-3">
        <p className="num font-semibold">{todayLabel()}</p>
        <nav className="flex gap-4 text-[13px]">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={tab === key ? "font-semibold underline underline-offset-[6px]" : "text-mute hover:text-ink"}
            >
              {label}
            </button>
          ))}
        </nav>
        {canInstall && (
          <button onClick={install} className="ml-auto text-[12px] text-mute underline underline-offset-4 hover:text-ink">
            Dock에 앱으로 설치
          </button>
        )}
      </header>

      <main className="grid flex-1 gap-8 py-4 md:min-h-0 md:grid-cols-[1fr_340px]">
        <div className="md:min-h-0 md:overflow-y-auto md:pr-2">
          {tab === "todos" ? (
            <TodoList
              todos={todo.todos}
              loading={todo.loading}
              error={todo.error}
              clearError={todo.clearError}
              onAdd={todo.add}
              onToggle={todo.toggle}
              onDelete={todo.remove}
            />
          ) : (
            <ReportView />
          )}
        </div>
        <aside className="md:min-h-0 md:border-l md:border-line md:pl-6">
          <ChatPane messages={chat.messages} sending={chat.sending} onSend={chat.send} health={health} />
        </aside>
      </main>
    </div>
  );
}
