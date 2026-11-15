import { shiftMonth, thisMonth, useMonthlyReport } from "../hooks/useMonthlyReport";

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function Bars({ data }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <div className="flex h-28 items-end gap-2">
      {Object.entries(data).map(([day, n]) => (
        <div key={day} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[11px] text-slate-400">{n || ""}</span>
          <div className="w-full rounded-t-md bg-indigo-500/80" style={{ height: `${(n / max) * 80}px`, minHeight: n ? 4 : 2, opacity: n ? 1 : 0.15 }} />
          <span className="text-xs text-slate-500">{day}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportView() {
  const { month, setMonth, report, loading, error, reload } = useMonthlyReport();
  const s = report?.stats;
  const [y, m] = month.split("-");

  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-200/60" aria-label="이전 달">‹</button>
          <h2 className="text-lg font-bold">{y}년 {Number(m)}월 리포트</h2>
          <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-200/60 disabled:opacity-30" aria-label="다음 달">›</button>
        </div>
        {report && (
          <span className={`rounded-full px-2 py-0.5 text-xs ${report.finalized ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
            {report.finalized ? "확정" : "진행 중"}
          </span>
        )}
      </div>

      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}
      {loading && !report && <p className="text-sm text-slate-400">집계 중…</p>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="완료율" value={`${s.completion_rate}%`} sub={`${s.created}개 중`} />
            <Stat label="완료" value={s.completed} sub={`남은 일 ${s.still_pending}`} />
            <Stat label="마감 전 완료" value={s.on_time} sub={`지각 ${s.late}`} />
            <Stat label="최고의 요일" value={s.best_weekday ? `${s.best_weekday}요일` : "-"} />
          </div>

          <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-white shadow">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">🤖 AI 한 달 회고</h3>
              <button onClick={() => reload(true)} disabled={loading} className="rounded-lg bg-white/20 px-3 py-1 text-xs hover:bg-white/30 disabled:opacity-50">
                {loading ? "생성 중…" : "다시 쓰기"}
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{report.ai_comment}</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <h3 className="mb-3 text-sm font-semibold">요일별 완료</h3>
              <Bars data={s.by_weekday} />
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <h3 className="mb-3 text-sm font-semibold">카테고리별</h3>
              {s.by_category.length === 0 && <p className="text-sm text-slate-400">기록 없음</p>}
              <ul className="flex flex-col gap-2.5">
                {s.by_category.map((c) => {
                  const pct = c.created ? Math.round((c.completed / c.created) * 100) : 0;
                  return (
                    <li key={c.category}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{c.category}</span>
                        <span className="text-slate-400">{c.completed}/{c.created}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
