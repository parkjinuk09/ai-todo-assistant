import { shiftMonth, thisMonth, useMonthlyReport } from "../hooks/useMonthlyReport";
import { CATEGORY_COLOR } from "../lib/format";

function Num({ label, value, sub }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[11.5px] text-mute">{label}</dt>
      <dd className="num mt-0.5 text-[24px] font-semibold leading-tight tracking-tight">{value}</dd>
      {sub && <dd className="num text-[11.5px] text-mute">{sub}</dd>}
    </div>
  );
}

function Weekdays({ data }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <div className="flex h-28 items-end gap-2.5 px-4 pb-3 pt-4">
      {Object.entries(data).map(([day, n]) => (
        <div key={day} className="flex flex-1 flex-col items-center gap-1">
          <span className="num text-[11px] text-mute">{n || ""}</span>
          <div
            className="w-full rounded-[4px]"
            style={{ height: `${Math.max(3, (n / max) * 64)}px`, background: n ? "var(--color-accent)" : "var(--color-field)" }}
          />
          <span className="text-[11px] text-mute">{day}</span>
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
    <div className={`mx-auto max-w-2xl ${loading && report ? "opacity-50" : ""}`}>
      <div className="flex items-end justify-between px-1">
        <h2 className="num text-[26px] font-bold leading-none tracking-tight">
          {Number(m)}월 <span className="font-normal text-mute">{y}</span>
        </h2>
        <div className="flex items-center gap-3">
          {report && <span className="text-[12px] text-mute">{report.finalized ? "마감된 달" : "진행 중"}</span>}
          <div className="flex items-center rounded-md bg-field p-0.5 text-[12px]">
            <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달" className="rounded px-2 py-0.5 hover:bg-hover">‹</button>
            <button
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={month >= thisMonth()}
              aria-label="다음 달"
              className="rounded px-2 py-0.5 hover:bg-hover disabled:opacity-25"
            >›</button>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="group-box mt-4 px-3 py-2.5 text-danger">{error}</p>}
      {loading && !report && <p className="mt-10 text-center text-mute">집계 중… (회고 문장을 로컬 모델이 쓰는 중이라 몇 초 걸려)</p>}
      {s && empty && <p className="mt-10 text-center text-mute">이 달에는 기록이 없어.</p>}

      {s && !empty && (
        <>
          <dl className="group-box mt-4 grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
            <Num label="완료율" value={`${s.completion_rate}%`} sub={`${s.created}개 중 ${s.completed}개`} />
            <Num label="마감 전 완료" value={s.on_time} sub={`늦게 끝냄 ${s.late}`} />
            <Num label="아직 남음" value={s.still_pending} />
            <Num label="제일 많이 한 요일" value={s.best_weekday ? `${s.best_weekday}요일` : "-"} />
          </dl>

          <section className="mt-5">
            <div className="flex items-baseline justify-between">
              <h3 className="section-label">한 달 회고</h3>
              <button onClick={() => reload(true)} disabled={loading} className="btn-plain text-[11.5px] !text-accent disabled:opacity-50">
                {loading ? "쓰는 중…" : "다시 쓰기"}
              </button>
            </div>
            <p className="group-box whitespace-pre-wrap px-4 py-3 leading-relaxed">{report.ai_comment}</p>
          </section>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <section>
              <h3 className="section-label">요일별 완료</h3>
              <div className="group-box"><Weekdays data={s.by_weekday} /></div>
            </section>
            <section>
              <h3 className="section-label">분류별 완료 / 전체</h3>
              <ul className="group-box flex flex-col gap-3 px-4 py-3.5">
                {s.by_category.map((c) => (
                  <li key={c.category}>
                    <div className="num flex justify-between text-[12px]">
                      <span>{c.category}</span>
                      <span className="text-mute">{c.completed}/{c.created}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-field">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${c.created ? Math.min(100, (c.completed / c.created) * 100) : 0}%`,
                          background: CATEGORY_COLOR[c.category] || "var(--color-accent)",
                        }}
                      />
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
