import { useEffect, useState } from "react";
import { api } from "../api/client";

export function useChat({ onTodosChanged }) {
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.chatHistory().then(setMessages).catch(() => {});
  }, []);

  const send = async (text) => {
    const optimistic = { id: `tmp-${Date.now()}`, role: "user", content: text };
    setMessages((m) => [...m, optimistic]);
    setSending(true);
    try {
      const res = await api.sendChat(text);
      setMessages((m) => [...m, { id: `ai-${Date.now()}`, role: "assistant", content: res.reply, actions: res.actions }]);
      onTodosChanged(res.todos);
    } catch (e) {
      setMessages((m) => [...m, { id: `err-${Date.now()}`, role: "error", content: e.message }]);
    } finally {
      setSending(false);
    }
  };

  return { messages, sending, send };
}
