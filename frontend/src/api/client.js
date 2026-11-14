const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => null);
    throw new Error(typeof detail === "string" ? detail : `요청 실패 (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  listTodos: () => request("/todos"),
  createTodo: (body) => request("/todos", { method: "POST", body }),
  updateTodo: (id, body) => request(`/todos/${id}`, { method: "PATCH", body }),
  deleteTodo: (id) => request(`/todos/${id}`, { method: "DELETE" }),
  chatHistory: () => request("/chat"),
  sendChat: (message) => request("/chat", { method: "POST", body: { message } }),
  briefing: () => request("/briefing"),
};
