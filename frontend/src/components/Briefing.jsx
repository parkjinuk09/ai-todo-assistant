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
    <div className="mt-3">
      {text && <p className="group-box mb-1.5 whitespace-pre-wrap px-3 py-2.5">{text}</p>}
      <button onClick={load} disabled={loading} className="btn-plain text-[12px] !text-accent disabled:opacity-60">
        {loading ? "추천 받는 중…" : text ? "다시 추천받기" : "오늘 뭐부터 할지 추천받기"}
      </button>
    </div>
  );
}
