import { useState } from "react";
import ChatPanel from "./components/ChatPanel";
import InstallButton from "./components/InstallButton";
import ReportView from "./components/ReportView";
import TodoPanel from "./components/TodoPanel";
import { useChat } from "./hooks/useChat";
import { useTodos } from "./hooks/useTodos";

const TABS = { todos: "📋 할 일", report: "📊 월간 리포트" };

export default function App() {
  const [tab, setTab] = useState("todos");
  const todo = useTodos();
  const chat = useChat({ onTodosChanged: todo.setTodos });

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-4 md:px-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight">
          <span className="text-indigo-600">AI</span> Todo
        </h1>
        <nav className="flex rounded-lg bg-slate-200/60 p-0.5 text-sm">
          {Object.entries(TABS).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1 ${tab === key ? "bg-white font-medium shadow-sm" : "text-slate-500"}`}>
              {label}
            </button>
          ))}
        </nav>
        <div className="ml-auto"><InstallButton /></div>
      </header>
      <main className="grid min-h-0 flex-1 gap-4 md:grid-cols-[1fr_minmax(320px,420px)]">
        {tab === "todos" ? (
          <TodoPanel
            todos={todo.todos}
            loading={todo.loading}
            error={todo.error}
            onAdd={todo.add}
            onToggle={todo.toggle}
            onDelete={todo.remove}
          />
        ) : (
          <ReportView />
        )}
        <ChatPanel messages={chat.messages} sending={chat.sending} onSend={chat.send} />
      </main>
    </div>
  );
}
