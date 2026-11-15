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

  // 낙관적 업데이트가 실패하면 서버 상태로 되돌리고 에러를 보여준다
  const run = async (fn) => {
    try {
      await fn();
      setError(null);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      refresh();
    }
  };

  const add = (body) => run(() => api.createTodo(body));
  const toggle = (todo) => {
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
    return run(() => api.updateTodo(todo.id, { done: !todo.done }));
  };
  const update = (id, body) => {
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, ...body } : t)));
    return run(() => api.updateTodo(id, body));
  };
  const remove = (id) => {
    setTodos((ts) => ts.filter((t) => t.id !== id));
    return run(() => api.deleteTodo(id));
  };

  return { todos, setTodos, loading, error, clearError: () => setError(null), add, toggle, update, remove };
}
