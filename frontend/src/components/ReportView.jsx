import { shiftMonth, thisMonth, useMonthlyReport } from "../hooks/useMonthlyReport";

function Num({ label, value, sub }) {
  return (
    <div>
      <dt className="text-[12px] text-mute">{label}</dt>
      <dd className="num text-[22px] font-semibold leading-tight">{value}</dd>
      {sub && <dd className="num text-[12px] text-mute">{sub}</dd>}
    </div>
  );
}

function Weekdays({ data }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <div className="flex h-24 items-end gap-2">
      {Object.entries(data).map(([day, n]) => (
        <div key={day} className="flex flex-1 flex-col items-center gap-1">
          <span className="num text-[11px] text-mute">{n || ""}</span>
          <div className="w-full bg-ink" style={{ height: `${(n / max) * 64}px`, minHeight: 1, opacity: n ? 1 : 0.15 }} />
          <span className="text-[12px] text-mute">{day}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportView() {
  const { month, setMonth, report, loading, error, reload } = useMonthlyReport();
  const s = report?.stats;
  const [y, m] = month.split("-");
  const empty = s && s.created === 0 && s.completed === 0;

  return (
    <div className={loading && report ? "opacity-50" : ""}>
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-1 text-mute hover:text-ink" aria-label="이전 달">←</button>
        <h2 className="num font-semibold">{y}년 {Number(m)}월</h2>
        <button
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= thisMonth()}
          className="px-1 text-mute hover:text-ink disabled:opacity-20"
          aria-label="다음 달"
        >→</button>
        {report && <span className="ml-auto text-[12px] text-mute">{report.finalized ? "마감된 달" : "진행 중 · 실시간 집계"}</span>}
      </div>

      {error && <p role="alert" className="mt-3 border-l-2 border-accent pl-3 text-[13px] text-accent">{error}</p>}
      {loading && !report && <p className="mt-6 text-mute">집계 중… (회고 문장을 로컬 모델이 쓰는 중이라 몇 초 걸려)</p>}

      {s && empty && <p className="mt-6 text-mute">이 달에는 기록이 없어.</p>}

      {s && !empty && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Num label="완료율" value={`${s.completion_rate}%`} sub={`${s.created}개 중 ${s.completed}개`} />
            <Num label="마감 전 완료" value={s.on_time} sub={`늦게 끝냄 ${s.late}`} />
            <Num label="아직 남음" value={s.still_pending} />
            <Num label="제일 많이 한 요일" value={s.best_weekday ? `${s.best_weekday}요일` : "-"} />
          </dl>

          <section className="mt-6">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[12px] font-semibold text-mute">한 달 회고</h3>
              <button onClick={() => reload(true)} disabled={loading} className="text-[12px] text-mute underline underline-offset-4 hover:text-ink disabled:no-underline">
                {loading ? "쓰는 중…" : "다시 쓰기"}
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap border-l-2 border-ink pl-3">{report.ai_comment}</p>
          </section>

          <div className="mt-6 grid gap-8 sm:grid-cols-2">
            <section>
              <h3 className="mb-2 text-[12px] font-semibold text-mute">요일별 완료</h3>
              <Weekdays data={s.by_weekday} />
            </section>
            <section>
              <h3 className="mb-2 text-[12px] font-semibold text-mute">분류별 (완료/전체)</h3>
              <ul className="flex flex-col gap-2">
                {s.by_category.map((c) => (
                  <li key={c.category}>
                    <div className="num flex justify-between text-[13px]">
                      <span>{c.category}</span>
                      <span className="text-mute">{c.completed}/{c.created}</span>
                    </div>
                    <div className="h-1 bg-line">
                      <div className="h-1 bg-ink" style={{ width: `${c.created ? Math.min(100, (c.completed / c.created) * 100) : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
