import { useState } from "react";
import { api } from "../api/client";

export default function BriefingCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await api.briefing()); } finally { setLoading(false); }
  };

  return (
    <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-white shadow">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">☀️ 오늘 브리핑</h2>
        <button onClick={load} disabled={loading} className="rounded-lg bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30 disabled:opacity-50">
          {loading ? "생각 중…" : data ? "새로고침" : "받기"}
        </button>
      </div>
      {data && (
        <>
          <div className="mt-2 flex gap-3 text-xs text-indigo-100">
            <span>밀린 일 <b className="text-white">{data.overdue.length}</b></span>
            <span>오늘 마감 <b className="text-white">{data.today.length}</b></span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{data.summary}</p>
        </>
      )}
    </div>
  );
}
