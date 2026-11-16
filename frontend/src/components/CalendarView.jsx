import { useState } from "react";
import { shiftMonth, thisMonth } from "../hooks/useMonthlyReport";
import { CATEGORY_COLOR, WEEKDAY, byDay, isLate, monthGrid, moveToDay, ymd } from "../lib/format";
import AddTodo from "./AddTodo";
import { Group } from "./TodoList";
import TodoRow from "./TodoRow";

const MAX_IN_CELL = 3;

function Chip({ todo }) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/todo-id", String(todo.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      title={todo.title}
      className={`flex items-center gap-1 truncate rounded-[4px] px-1 text-[11px] leading-[17px] hover:bg-hover ${
        todo.done ? "text-faint line-through" : isLate(todo) ? "text-danger" : ""
      }`}
    >
      <span className="size-[5px] shrink-0 rounded-full" style={{ background: todo.done ? "var(--color-faint)" : CATEGORY_COLOR[todo.category] }} />
      <span className="truncate">{todo.title}</span>
    </li>
  );
}

function Cell({ cell, items, today, selected, onSelect, onDropTodo }) {
  const [over, setOver] = useState(false);
  const extra = items.length - MAX_IN_CELL;
  const isToday = cell.key === today;

  return (
    <div
      role="gridcell"
      tabIndex={0}
      aria-selected={selected}
      aria-label={`${cell.date.getMonth() + 1}월 ${cell.date.getDate()}일, ${items.length}개`}
      onClick={() => onSelect(cell.key)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(cell.key)}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = Number(e.dataTransfer.getData("text/todo-id"));
        if (id) onDropTodo(id, cell.key);
      }}
      className={`flex min-h-[52px] min-w-0 flex-col gap-0.5 rounded-lg p-1 transition-colors sm:min-h-[80px] ${
        over ? "bg-accent/10 ring-1 ring-accent/40" : selected ? "bg-selected" : "hover:bg-hover"
      }`}
    >
      <div className="flex justify-center sm:justify-end">
        <span
          className={`num grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-[12px] ${
            isToday ? "bg-danger font-semibold text-white" : cell.inMonth ? "" : "text-faint"
          } ${cell.date.getDay() === 0 && !isToday && cell.inMonth ? "text-mute" : ""}`}
        >
          {cell.date.getDate()}
        </span>
      </div>
      {/* 넓은 화면: 제목 / 좁은 화면: 점만 */}
      <ul className={`hidden min-w-0 flex-col sm:flex ${cell.inMonth ? "" : "opacity-50"}`}>
        {items.slice(0, MAX_IN_CELL).map((t) => <Chip key={t.id} todo={t} />)}
        {extra > 0 && <li className="num px-1 text-[11px] text-mute">+{extra}개</li>}
      </ul>
      <div className={`flex justify-center gap-[3px] sm:hidden ${cell.inMonth ? "" : "opacity-50"}`}>
        {items.slice(0, 4).map((t) => (
          <span
            key={t.id}
            className="size-[5px] rounded-full"
            style={{ background: t.done ? "var(--color-faint)" : CATEGORY_COLOR[t.category] }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CalendarView({ todos, onAdd, onToggle, onDelete, onUpdate }) {
  const [month, setMonth] = useState(thisMonth());
  const today = ymd(new Date());
  const [selected, setSelected] = useState(today);
  const cells = monthGrid(month);
  const days = byDay(todos);
  const [y, m] = month.split("-").map(Number);

  const select = (key) => {
    setSelected(key);
    const km = key.slice(0, 7);
    if (km !== month) setMonth(km);
  };
  const goToday = () => { setMonth(thisMonth()); setSelected(today); };
  const dropTodo = (id, key) => {
    const t = todos.find((x) => x.id === id);
    if (t?.due_at && ymd(new Date(t.due_at)) !== key) onUpdate(id, { due_at: moveToDay(t.due_at, key) });
    setSelected(key);
  };

  const [sy, sm, sd] = selected.split("-").map(Number);
  const sel = new Date(sy, sm - 1, sd);
  const selItems = days[selected] || [];
  const monthCount = cells.filter((c) => c.inMonth).reduce((n, c) => n + (days[c.key]?.filter((t) => !t.done).length || 0), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-end justify-between px-1">
        <h2 className="num text-[26px] font-bold leading-none tracking-tight">
          {m}월 <span className="font-normal text-mute">{y}</span>
        </h2>
        <div className="flex items-center gap-3">
          <span className="num text-[12px] text-mute">남은 일 {monthCount}개</span>
          <div className="flex items-center rounded-md bg-field p-0.5 text-[12px]">
            <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달" className="rounded px-2 py-0.5 hover:bg-hover">‹</button>
            <button onClick={goToday} className="rounded px-2 py-0.5 hover:bg-hover">오늘</button>
            <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달" className="rounded px-2 py-0.5 hover:bg-hover">›</button>
          </div>
        </div>
      </div>

      <div className="group-box mt-4 p-1.5">
        <div className="grid grid-cols-7 pb-1">
          {[...WEEKDAY].map((d) => (
            <span key={d} className="px-2 pt-1 text-center text-[11px] sm:text-right font-medium text-mute">{d}</span>
          ))}
        </div>
        <div role="grid" aria-label={`${y}년 ${m}월`} className="grid grid-cols-7 gap-0.5">
          {cells.map((c) => (
            <Cell
              key={c.key}
              cell={c}
              items={days[c.key] || []}
              today={today}
              selected={c.key === selected}
              onSelect={select}
              onDropTodo={dropTodo}
            />
          ))}
        </div>
      </div>
      <p className="mt-1.5 hidden px-1 text-[11px] text-mute [@media(hover:hover)]:sm:block">할 일을 다른 날짜로 끌어다 놓으면 시간은 그대로 두고 날짜만 옮겨.</p>

      <div className="mt-6">
        <h3 className="num px-1 text-[15px] font-semibold">
          {sel.getMonth() + 1}월 {sel.getDate()}일 {WEEKDAY[sel.getDay()]}요일
          {selected === today && <span className="ml-1.5 text-[12px] font-normal text-danger">오늘</span>}
        </h3>
        <div className="mt-2">
          <AddTodo onSubmit={onAdd} defaultDue={selected} placeholder="이 날에 할 일 추가" />
        </div>
        {selItems.length > 0 ? (
          <Group>
            {selItems.map((t) => <TodoRow key={t.id} todo={t} onToggle={onToggle} onDelete={onDelete} onUpdate={onUpdate} onlyTime />)}
          </Group>
        ) : (
          <p className="mt-4 px-1 text-mute">이 날은 비어 있어.</p>
        )}
      </div>
    </div>
  );
}
