import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

export function useTodos() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setTodos(await api.listTodos());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async (body) => { await api.createTodo(body); refresh(); };
  const toggle = async (todo) => {
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
    await api.updateTodo(todo.id, { done: !todo.done });
    refresh();
  };
  const remove = async (id) => {
    setTodos((ts) => ts.filter((t) => t.id !== id));
    await api.deleteTodo(id);
  };

  return { todos, setTodos, loading, error, refresh, add, toggle, remove };
}
