import { useState } from "react";
import { api } from "../api/client";

/** 남은 할 일을 보고 '뭐부터 할지' 추천. LLM이 꺼져 있으면 서버가 규칙 기반 문장을 돌려준다. */
export default function Briefing({ hasPending }) {
  const [text, setText] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!hasPending) return null;

  const load = async () => {
    setLoading(true);
    try {
      setText((await api.briefing()).summary);
    } catch (e) {
      setText(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-3 text-[13px]">
      <button onClick={load} disabled={loading} className="text-mute underline underline-offset-4 hover:text-ink disabled:no-underline">
        {loading ? "추천 받는 중…" : text ? "다시 추천받기" : "오늘 뭐부터 할지 추천받기"}
      </button>
      {text && <p className="mt-2 whitespace-pre-wrap border-l-2 border-ink pl-3">{text}</p>}
    </div>
  );
}
