import { useEffect, useRef, useState } from "react";

const EXAMPLES = ["내일 오후 3시 치과 추가해줘", "오늘 할 일 뭐 있어?", "치과 완료"];

function Elapsed() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="num">{sec}초</span>;
}

/** 서버가 보낸 안내문의 `명령어` 부분만 코드 모양으로 */
function Problem({ text }) {
  return (text || "").split("`").map((part, i) =>
    i % 2 ? <code key={i} className="rounded bg-field px-1 font-mono text-[11.5px]">{part}</code> : <span key={i}>{part}</span>);
}

function Message({ msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3 py-1.5 text-white">{msg.content}</p>
      </div>
    );
  }
  const error = msg.role === "error";
  return (
    <div className="max-w-[90%]">
      <p className={`whitespace-pre-wrap rounded-2xl rounded-bl-md px-3 py-1.5 ${error ? "bg-danger/10 text-danger" : "bg-field"}`}>
        {msg.content}
      </p>
      {msg.actions?.length > 0 && (
        <ul className="mt-1 px-1 text-[11.5px] text-mute">
          {msg.actions.map((a, i) => <li key={i}>✓ {a}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function ChatPane({ messages, sending, onSend, health }) {
  const [text, setText] = useState("");
  const bottom = useRef(null);
  const ready = health.llm && !sending;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  const submit = (value = text) => {
    if (!value.trim() || !ready) return;
    onSend(value.trim());
    setText("");
  };

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-[13px] font-semibold">비서</h2>
        <span className="flex items-center gap-1.5 text-[11.5px] text-mute">
          <span className={`size-1.5 rounded-full ${!health.checked ? "bg-faint" : health.llm ? "bg-c-health" : "bg-danger"}`} />
          {!health.checked ? "확인 중" : health.llm ? health.model : "꺼짐"}
        </span>
      </div>

      {health.checked && !health.llm && (
        <div className="mx-3 rounded-lg bg-field px-3 py-2 text-[12px] leading-relaxed">
          <Problem text={health.problem} />{" "}
          <button onClick={health.recheck} className="font-medium text-accent">다시 확인</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
        {messages.length === 0 && health.llm && (
          <div className="mt-auto flex flex-col items-start gap-1.5 text-[12px]">
            <p className="px-1 text-mute">이렇게 말하면 돼</p>
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => submit(ex)} className="rounded-full bg-field px-3 py-1 text-left hover:bg-selected">
                {ex}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => <Message key={m.id} msg={m} />)}
        {sending && (
          <p className="px-1 text-[12px] text-mute">생각하는 중… <Elapsed /></p>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="p-3 pt-1">
        <div className="flex items-end gap-1.5 rounded-[18px] bg-field py-1 pl-3 pr-1 focus-within:shadow-[0_0_0_3px_rgb(0_122_255/0.3)]">
          <textarea
            rows={1}
            value={text}
            disabled={!health.llm}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // 한글 조합 중 Enter는 무시 (마지막 글자 중복 전송 방지), Shift+Enter는 줄바꿈
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={health.llm ? "메시지" : "지금은 쓸 수 없어"}
            aria-label="비서에게 메시지"
            className="max-h-28 min-w-0 flex-1 resize-none bg-transparent py-1 outline-none [field-sizing:content] placeholder:text-mute"
          />
          <button
            disabled={!ready || !text.trim()}
            aria-label="보내기"
            className="grid size-[26px] shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-30"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
