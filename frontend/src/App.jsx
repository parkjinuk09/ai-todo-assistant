import ChatPanel from "./components/ChatPanel";
import InstallButton from "./components/InstallButton";
import TodoPanel from "./components/TodoPanel";
import { useChat } from "./hooks/useChat";
import { useTodos } from "./hooks/useTodos";

export default function App() {
  const todo = useTodos();
  const chat = useChat({ onTodosChanged: todo.setTodos });

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-4 md:px-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">
          <span className="text-indigo-600">AI</span> Todo
        </h1>
        <InstallButton />
      </header>
      <main className="grid min-h-0 flex-1 gap-4 md:grid-cols-[1fr_minmax(320px,420px)]">
        <TodoPanel
          todos={todo.todos}
          loading={todo.loading}
          error={todo.error}
          onAdd={todo.add}
          onToggle={todo.toggle}
          onDelete={todo.remove}
        />
        <ChatPanel messages={chat.messages} sending={chat.sending} onSend={chat.send} />
      </main>
    </div>
  );
}
