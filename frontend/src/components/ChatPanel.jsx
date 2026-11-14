import { useEffect, useRef, useState } from "react";

const SUGGESTIONS = ["내일 3시까지 OS 과제 추가해줘", "오늘 뭐부터 해야 돼?", "과제 끝났어"];

function Bubble({ msg }) {
  const mine = msg.role === "user";
  const style = mine
    ? "self-end bg-indigo-600 text-white"
    : msg.role === "error" ? "self-start bg-rose-50 text-rose-600" : "self-start bg-slate-100";
  return (
    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${style}`}>
      {msg.content}
      {msg.actions?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {msg.actions.map((a, i) => (
            <span key={i} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-indigo-600 ring-1 ring-indigo-100">✓ {a}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatPanel({ messages, sending, onSend }) {
  const [text, setText] = useState("");
  const bottom = useRef(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const submit = (value = text) => {
    if (!value.trim() || sending) return;
    onSend(value.trim());
    setText("");
  };

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
      <header className="border-b border-slate-100 px-4 py-3">
        <h2 className="font-bold">💬 비서</h2>
        <p className="text-xs text-slate-400">말로 할 일을 추가·수정·완료할 수 있어요</p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="m-auto flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-slate-400">이렇게 말해 보세요</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => submit(s)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs hover:bg-indigo-50 hover:text-indigo-600">{s}</button>
            ))}
          </div>
        )}
        {messages.map((m) => <Bubble key={m.id} msg={m} />)}
        {sending && <div className="self-start rounded-2xl bg-slate-100 px-3.5 py-2 text-sm text-slate-400">처리 중…</div>}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex gap-2 border-t border-slate-100 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 금요일 오전 10시 치과 넣어줘"
          className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <button disabled={sending || !text.trim()} className="rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
          전송
        </button>
      </form>
    </section>
  );
}
