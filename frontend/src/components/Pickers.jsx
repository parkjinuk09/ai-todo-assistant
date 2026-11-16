import { useEffect, useRef, useState } from "react";
import { WEEKDAY, monthGrid, parseTime, time, ymd } from "../lib/format";

/** 바깥을 누르거나 Esc를 누르면 닫히는 팝업 */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);
  // Esc는 팝업만 닫고, 바깥의 수정 폼까지 닫히지 않게 막는다
  const onKeyDown = (e) => {
    if (open && e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  };
  return { open, setOpen, ref, onKeyDown };
}

const chip = "flex items-center gap-1.5 rounded-md bg-field px-2 py-1 hover:bg-selected";
const popover =
  "absolute left-0 top-full z-30 mt-1.5 rounded-xl bg-popover p-2 shadow-[0_0_0_0.5px_rgb(0_0_0/0.14),0_10px_32px_rgb(0_0_0/0.22)] backdrop-blur-2xl";

const Chevron = () => (
  <svg viewBox="0 0 10 10" className="size-2 text-mute" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3.8 5 6.8l3-3" />
  </svg>
);

/** 분류·중요도처럼 몇 개 중 하나 고르기. options: [{ value, label, color? }] */
export function Select({ value, onChange, options, label }) {
  const p = usePopover();
  const current = options.find((o) => String(o.value) === String(value)) || options[0];
  return (
    <div ref={p.ref} onKeyDown={p.onKeyDown} className="relative">
      <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={p.open} onClick={() => p.setOpen(!p.open)} className={chip}>
        {current.color && <span className="size-2 rounded-full" style={{ background: current.color }} />}
        {current.label}
        <Chevron />
      </button>
      {p.open && (
        <ul role="listbox" aria-label={label} className={`${popover} min-w-[120px] !p-1`}>
          {options.map((o) => {
            const selected = String(o.value) === String(value);
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { onChange(o.value); p.setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-accent hover:text-white"
                >
                  <span className="w-3 text-[11px]">{selected ? "✓" : ""}</span>
                  {o.color && <span className="size-2 rounded-full" style={{ background: o.color }} />}
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const TIMES = [["09:00", "오전 9시"], ["12:00", "정오"], ["15:00", "오후 3시"], ["18:00", "오후 6시"], ["21:00", "오후 9시"]];

function dueLabel(value) {
  const allDay = !value.includes("T");
  const d = new Date(allDay ? `${value}T00:00` : value);
  const today = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  const day = diff === 0 ? "오늘" : diff === 1 ? "내일" : `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;
  return allDay ? day : `${day} ${time(d)}`;
}

/**
 * 마감 고르기. value는 'YYYY-MM-DD'(하루 종일) 또는 'YYYY-MM-DDTHH:MM' (없으면 "").
 * 자주 쓰는 날은 한 번에(오늘·내일·주말·다음 주), 나머지는 달력. 날짜만 고르면 하루 종일이고,
 * 시간은 필요할 때만 버튼이나 직접 입력으로 붙인다.
 */
export function DuePicker({ value, onChange }) {
  const p = usePopover();
  const now = new Date();
  const todayKey = ymd(now);
  const [dateKey, timeKey = ""] = value ? value.split("T") : ["", ""];
  const [month, setMonth] = useState((dateKey || todayKey).slice(0, 7));
  const [typed, setTyped] = useState("");

  const toggle = () => {
    if (!p.open) {
      setMonth((dateKey || todayKey).slice(0, 7));
      setTyped("");
    }
    p.setOpen(!p.open);
  };

  // 날짜를 바꿔도 고른 시간은 유지. 시간을 고른 적이 없으면 하루 종일
  const pickDate = (key) => {
    onChange(timeKey ? `${key}T${timeKey}` : key);
    setMonth(key.slice(0, 7));
  };
  const pickTime = (t) => onChange(`${dateKey || todayKey}T${t}`);

  const saturday = addDays(now, (6 - now.getDay() + 7) % 7);
  const nextMonday = addDays(now, ((8 - now.getDay()) % 7) || 7);
  const presets = [
    ["오늘", todayKey],
    ["내일", ymd(addDays(now, 1))],
    ["이번 주말", ymd(saturday)],
    ["다음 주", ymd(nextMonday)],
  ];

  const [y, m] = month.split("-").map(Number);
  const shift = (n) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(ymd(d).slice(0, 7));
  };
  const commitTyped = () => {
    const t = parseTime(typed);
    if (t) {
      pickTime(t);
      setTyped("");
    }
    return !!t;
  };

  return (
    <div ref={p.ref} onKeyDown={p.onKeyDown} className="relative">
      <button type="button" aria-label="마감" aria-haspopup="dialog" aria-expanded={p.open} onClick={toggle} className={`${chip} num ${value ? "" : "text-mute"}`}>
        <svg viewBox="0 0 16 16" className="size-3.5 text-mute" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.2" y="3" width="11.6" height="11" rx="2.2" /><path d="M2.2 6.6h11.6M5.5 1.6v2.6M10.5 1.6v2.6" />
        </svg>
        {value ? dueLabel(value) : "날짜"}
      </button>

      {p.open && (
        <div role="dialog" aria-label="마감 고르기" className={`${popover} w-[276px]`}>
          <div className="grid grid-cols-2 gap-1">
            {presets.map(([label, key]) => (
              <button
                key={label}
                type="button"
                onClick={() => pickDate(key)}
                className={`rounded-md px-2 py-1 text-left ${dateKey === key ? "bg-accent text-white" : "bg-field hover:bg-selected"}`}
              >
                {label}
                <span className={`num ml-1.5 text-[11px] ${dateKey === key ? "text-white/75" : "text-mute"}`}>
                  {Number(key.slice(5, 7))}/{Number(key.slice(8))}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-2.5 flex items-center justify-between px-1">
            <span className="num text-[12px] font-semibold">{y}년 {m}월</span>
            <span className="flex">
              <button type="button" onClick={() => shift(-1)} aria-label="이전 달" className="btn-plain !px-1.5">‹</button>
              <button type="button" onClick={() => shift(1)} aria-label="다음 달" className="btn-plain !px-1.5">›</button>
            </span>
          </div>
          <div className="num mt-1 grid grid-cols-7 text-center text-[11.5px]">
            {[...WEEKDAY].map((d) => <span key={d} className="py-0.5 text-[10.5px] text-mute">{d}</span>)}
            {monthGrid(month).map((c) => {
              const selected = c.key === dateKey;
              const isToday = c.key === todayKey;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => pickDate(c.key)}
                  aria-label={`${c.date.getMonth() + 1}월 ${c.date.getDate()}일`}
                  aria-pressed={selected}
                  className={`mx-auto grid size-[28px] place-items-center rounded-full ${
                    selected ? "bg-accent font-semibold text-white" : isToday ? "font-semibold text-danger hover:bg-hover" : c.inMonth ? "hover:bg-hover" : "text-faint hover:bg-hover"
                  }`}
                >
                  {c.date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 border-t border-line pt-2">
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => onChange(dateKey || todayKey)}
                className={`rounded-md py-0.5 text-center text-[11px] ${dateKey && !timeKey ? "bg-accent text-white" : "bg-field hover:bg-selected"}`}
              >
                하루 종일
              </button>
              {TIMES.map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => pickTime(t)}
                  className={`rounded-md py-0.5 text-center text-[11px] ${timeKey === t ? "bg-accent text-white" : "bg-field hover:bg-selected"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onBlur={commitTyped}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault(); // 바깥 폼이 제출되지 않게
                  e.stopPropagation();
                  if (!typed.trim() || commitTyped()) p.setOpen(false);
                }
              }}
              placeholder={timeKey ? `시간 직접 입력 (지금 ${timeKey})` : "시간 직접 입력 (예: 15:30, 오후 3시 반)"}
              aria-label="시간 직접 입력"
              className={`field num mt-1.5 w-full text-[12px] ${typed && !parseTime(typed) ? "!shadow-[0_0_0_2px_var(--color-danger)]" : ""}`}
            />
          </div>

          <div className="mt-2 flex justify-between">
            <button type="button" onClick={() => { onChange(""); p.setOpen(false); }} disabled={!value} className="btn-plain text-[12px] disabled:opacity-40">
              날짜 없음
            </button>
            <button type="button" onClick={() => p.setOpen(false)} className="btn-plain text-[12px] !text-accent">완료</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 누르면 바로 실행되는 작은 메뉴. items: [{ label, hint?, onSelect }] */
export function Menu({ label, items, children, className = "", align = "left" }) {
  const p = usePopover();
  return (
    <div ref={p.ref} onKeyDown={p.onKeyDown} className="relative">
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={p.open} onClick={() => p.setOpen(!p.open)} className={className}>
        {children}
      </button>
      {p.open && (
        <ul role="menu" aria-label={label} className={`${popover} min-w-[150px] !p-1 ${align === "right" ? "!left-auto right-0" : ""}`}>
          {items.map((it) => (
            <li key={it.label}>
              <button
                type="button"
                role="menuitem"
                onClick={() => { p.setOpen(false); it.onSelect(); }}
                className="group/item flex w-full items-center justify-between gap-4 rounded-md px-2 py-1 text-left hover:bg-accent hover:text-white"
              >
                {it.label}
                {it.hint && <span className="num text-[11px] text-mute group-hover/item:text-white/75">{it.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
