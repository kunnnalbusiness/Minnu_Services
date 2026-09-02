import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtInr } from "@/lib/botTypes";
import type { DayPnl } from "@/lib/botTypes";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(d);
  return cells;
}

function MonthPanel({
  year,
  month,
  byDate,
  selectedDate,
  onSelectDate,
  isLightMode,
}: {
  year: number;
  month: number;
  byDate: Map<string, DayPnl>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  isLightMode: boolean;
}) {
  return (
    <div className="min-w-[150px] flex-1" data-testid="calendar-month" data-month={`${year}-${month + 1}`}>
      <p className="mb-1 font-heading text-[11px] font-semibold text-slate-200">
        {monthLabel(year, month)}
      </p>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((d, i) => (
            <span key={`${d}-${i}`} className="num text-center text-[8px] uppercase text-slate-600">
            {d}
          </span>
        ))}
        {monthGrid(year, month).map((day, index) => {
          if (day === null) return <span key={`pad-${index}`} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const entry = byDate.get(key);
          const pnl = entry?.pnl_inr ?? 0;
          const selected = selectedDate === key;
          const tone =
            !entry || entry.trades === 0
              ? "bg-[#161d2b] text-slate-500"
              : pnl > 0
                ? "bg-[#00c076]/25 text-[#7ff0c0]"
                : pnl < 0
                  ? "bg-[#ff455b]/25 text-[#ffa8b3]"
                  : "bg-[#1e293b] text-slate-300";
          return (
            <button
              type="button"
              key={key}
              data-testid="calendar-day"
              data-date={key}
              data-pnl={entry ? entry.pnl_inr.toFixed(0) : "0"}
              title={entry ? `${key}: ${fmtInr(entry.pnl_inr)} · ${entry.trades} trades` : `${key}: no trades`}
              className={cn(
                "num grid h-5 place-items-center rounded text-[9px] transition-colors duration-150",
                tone,
                selected && (isLightMode ? "ring-1 ring-[#7f9bff] ring-offset-1 ring-offset-[var(--card)]" : "ring-1 ring-[#7f9bff] ring-offset-1 ring-offset-[#0d111a]"),
              )}
              onClick={() => onSelectDate(key)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PnlCalendar({
  days,
  selectedDate,
  onSelectDate,
}: {
  days: DayPnl[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const isLightMode = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const second = new Date(base);
  second.setMonth(second.getMonth() + 1);

  return (
    <div className={`rounded-lg border p-2 ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]"}`}>
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className={`font-heading text-xs font-semibold ${isLightMode ? "text-slate-900" : "text-slate-100"}`}>Calendar</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="calendar-prev-button"
            onClick={() => setOffset((o) => o - 1)}
            className="grid h-6 w-6 place-items-center rounded text-slate-400 transition-colors duration-150 hover:bg-[#1e293b] hover:text-slate-100"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            data-testid="calendar-next-button"
            onClick={() => setOffset((o) => o + 1)}
            className="grid h-6 w-6 place-items-center rounded text-slate-400 transition-colors duration-150 hover:bg-[#1e293b] hover:text-slate-100"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <MonthPanel
          year={base.getFullYear()}
          month={base.getMonth()}
          byDate={byDate}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          isLightMode={isLightMode}
        />
        <MonthPanel
          year={second.getFullYear()}
          month={second.getMonth()}
          byDate={byDate}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          isLightMode={isLightMode}
        />
      </div>

      <div className="num mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-[#1e293b] pt-1.5 text-[9px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-[#00c076]/25" /> profit
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-[#ff455b]/25" /> loss
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-[#161d2b]" /> no trades
        </span>
      </div>
    </div>
  );
}
