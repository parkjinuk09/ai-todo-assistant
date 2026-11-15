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
    i % 2 ? <code key={i} className="rounded bg-line px-1">{part}</code> : <span key={i}>{part}</span>);
}

function Message({ msg }) {
  const who = msg.role === "user" ? "나" : msg.role === "error" ? "오류" : "비서";
  return (
    <div className="py-2">
      <p className={`text-[11px] font-semibold ${msg.role === "error" ? "text-accent" : "text-mute"}`}>{who}</p>
      <p className={`whitespace-pre-wrap ${msg.role === "error" ? "text-accent" : ""}`}>{msg.content}</p>
      {msg.actions?.length > 0 && (
        <ul className="mt-1 text-[12px] text-mute">
          {msg.actions.map((a, i) => <li key={i}>→ {a}</li>)}
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
      <div className="flex items-baseline justify-between border-b border-line pb-2">
        <h2 className="font-semibold">비서</h2>
        <span className="text-[12px] text-mute">
          {!health.checked ? "확인 중" : health.llm ? `${health.model} · 로컬` : "사용 불가"}
        </span>
      </div>

      {health.checked && !health.llm && (
        <div className="mt-3 border-l-2 border-accent pl-3 text-[13px]">
          <Problem text={health.problem} />{" "}
          <button onClick={health.recheck} className="underline underline-offset-4">다시 확인</button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && health.llm && (
          <div className="py-3 text-[13px] text-mute">
            <p>이런 식으로 말하면 돼:</p>
            <ul className="mt-1">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button onClick={() => submit(ex)} className="text-left underline-offset-4 hover:text-ink hover:underline">“{ex}”</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m) => <Message key={m.id} msg={m} />)}
        {sending && (
          <p className="py-2 text-[13px] text-mute">처리 중… <Elapsed /> (로컬 모델이라 10~20초 걸릴 수 있어)</p>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2 border-t border-line pt-2">
        <textarea
          rows={2}
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
          placeholder={health.llm ? "말로 시키기 (Enter 전송, Shift+Enter 줄바꿈)" : "지금은 입력할 수 없어"}
          aria-label="비서에게 메시지"
          className="min-w-0 flex-1 resize-none rounded border border-line bg-white px-2 py-1.5 outline-none focus:border-ink disabled:bg-transparent"
        />
        <button disabled={!ready || !text.trim()} className="rounded bg-ink px-3 py-1.5 text-[13px] font-medium text-paper disabled:opacity-30">
          보내기
        </button>
      </form>
    </div>
  );
}
