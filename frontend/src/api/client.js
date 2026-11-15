const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error("서버에 연결할 수 없어. 백엔드가 켜져 있는지 확인해 줘.");
  }
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => null);
    throw new Error(typeof detail === "string" ? detail : `요청 실패 (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  health: () => request("/health"),
  listTodos: () => request("/todos"),
  createTodo: (body) => request("/todos", { method: "POST", body }),
  updateTodo: (id, body) => request(`/todos/${id}`, { method: "PATCH", body }),
  deleteTodo: (id) => request(`/todos/${id}`, { method: "DELETE" }),
  chatHistory: () => request("/chat"),
  sendChat: (message) => request("/chat", { method: "POST", body: { message } }),
  briefing: () => request("/briefing"),
  monthlyReport: (month, regenerate = false) =>
    request(`/reports/monthly?month=${month}${regenerate ? "&regenerate=true" : ""}`),
};
