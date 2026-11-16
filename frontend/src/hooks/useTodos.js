import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

const UNDO_MS = 5000;

export function useTodos() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // 되돌리기: 삭제는 5초 뒤에야 서버로 보낸다. 그동안은 화면에서만 숨긴다
  const [hidden, setHidden] = useState(() => new Set());
  const [toast, setToast] = useState(null); // { id, text, undo }
  const waiting = useRef(new Map()); // todo id → { timer, commit }
  const toastTimer = useRef(null);

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

  useEffect(() => {
    refresh();
    // 다른 곳(맥 빠른 추가, 메뉴 막대)에서 바뀐 내용을 반영: 창으로 돌아올 때 + 맥 앱이 보내는 신호
    window.addEventListener("focus", refresh);
    window.addEventListener("todos-changed", refresh);
    // 창을 닫으면 기다리던 삭제를 바로 보낸다
    const flush = () => waiting.current.forEach((w) => w.commit());
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("todos-changed", refresh);
      window.removeEventListener("pagehide", flush);
    };
  }, [refresh]);

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

  const show = (text, undo) => {
    clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({ id, text, undo });
    toastTimer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), UNDO_MS);
  };
  const dismiss = () => { clearTimeout(toastTimer.current); setToast(null); };
  /** 가장 최근 동작을 되돌린다. 되돌릴 게 없으면 false */
  const undo = () => {
    if (!toast) return false;
    toast.undo();
    dismiss();
    return true;
  };

  const unhide = (id) => setHidden((h) => { const n = new Set(h); n.delete(id); return n; });

  const add = (body) => run(() => api.createTodo(body));
  const toggle = (todo) => {
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
    if (!todo.done) {
      show(`‘${todo.title}’ 완료`, () => run(() => api.updateTodo(todo.id, { done: false })));
    }
    return run(() => api.updateTodo(todo.id, { done: !todo.done }));
  };
  const update = (id, body) => {
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, ...body } : t)));
    return run(() => api.updateTodo(id, body));
  };
  const remove = (id) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo || waiting.current.has(id)) return;
    setHidden((h) => new Set(h).add(id));
    const commit = () => {
      clearTimeout(waiting.current.get(id)?.timer);
      waiting.current.delete(id);
      setTodos((ts) => ts.filter((t) => t.id !== id));
      run(() => api.deleteTodo(id)).then(() => unhide(id));
    };
    waiting.current.set(id, { timer: setTimeout(commit, UNDO_MS), commit });
    show(`‘${todo.title}’ 삭제`, () => {
      clearTimeout(waiting.current.get(id)?.timer);
      waiting.current.delete(id);
      unhide(id);
    });
  };

  const visible = hidden.size ? todos.filter((t) => !hidden.has(t.id)) : todos;
  return {
    todos: visible, setTodos, loading, error, clearError: () => setError(null),
    add, toggle, update, remove, toast, undo, dismissToast: dismiss,
  };
}
