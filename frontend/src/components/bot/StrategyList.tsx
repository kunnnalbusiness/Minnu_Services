import { Maximize2, Minimize2, Pencil, Power, Trash2 } from "lucide-react";
import { useState } from "react";
import { STATUS_STYLE } from "@/lib/botTypes";
import type { Strategy } from "@/lib/botTypes";
import { cn } from "@/lib/utils";

export default function StrategyList({
  strategies,
  selectedId,
  onSelect,
  onToggleEnabled,
  onEdit,
}: {
  strategies: Strategy[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleEnabled: (strategy: Strategy) => void;
  onEdit: (strategy: Strategy) => void;
}) {
  const isLightMode = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "flex min-h-0 flex-col overflow-hidden rounded-lg border",
      expanded && "h-[clamp(360px,62vh,680px)] lg:h-full",
      isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]",
    )}>
      <div className={`flex items-center justify-between border-b px-2 py-1.5 sm:px-3 sm:py-2.5 ${isLightMode ? "border-[#dfeaf3]" : "border-[#1e293b]"}`}>
        <h2 className={`font-heading text-[12px] font-semibold sm:text-sm ${isLightMode ? "text-slate-900" : "text-slate-100"}`}>Strategies</h2>
        <div className="flex items-center gap-1.5">
          <span className="num text-[9px] text-slate-500 sm:text-[11px]" data-testid="strategy-count">
            {strategies.length} configured
          </span>
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse strategies" : "Expand strategies"}
            title={expanded ? "Collapse strategies" : "Expand strategies"}
            onClick={() => setExpanded((value) => !value)}
            className="grid h-6 w-6 place-items-center rounded border border-slate-700 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1 sm:p-1.5">
        {strategies.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-slate-500" data-testid="strategy-empty-state">
            No strategies yet — use “Add Strategy” to create one.
          </p>
        ) : (
          <ul className="grid w-full content-start self-start grid-cols-2 gap-1 sm:gap-1.5 sm:grid-cols-1 sm:gap-2">
            {strategies.map((s, index) => {
              const style = STATUS_STYLE[s.status];
              const selected = s.id === selectedId;
              return (
                <li key={s.id} className="min-w-0">
                  <div
                    data-testid="strategy-card"
                    data-strategy-id={s.id}
                    data-selected={selected}
                    onClick={() => onSelect(s.id)}
                    className={cn(
                      "flex h-full min-h-[150px] w-full cursor-pointer flex-col rounded-md border px-1.25 py-1 text-left transition-colors duration-150 sm:min-h-[160px] sm:px-1.5 sm:py-1.25",
                      selected
                        ? "border-[#00c076]/50 bg-[#00c076]/[0.06]"
                        : isLightMode
                          ? "border-[#dfeaf3] bg-[var(--background)] hover:border-[#c8d8ea]"
                          : "border-[#1e293b] bg-[#111724] hover:border-slate-600",
                    )}
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="num mt-0.5 text-[8px] font-semibold text-[#7f9bff]">{index + 1}.</span>
                      <span className="min-w-0 flex-1 font-heading text-[10px] font-semibold text-slate-100" data-testid="strategy-name">
                        {s.name}
                      </span>
                      <span
                        role="switch"
                        aria-checked={s.enabled}
                        tabIndex={0}
                        data-testid="strategy-enable-toggle"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleEnabled(s);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            onToggleEnabled(s);
                          }
                        }}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[8px] font-semibold transition-colors duration-150",
                          s.enabled
                            ? "bg-[#00c076]/12 text-[#00c076]"
                            : "bg-slate-500/12 text-slate-400 hover:text-slate-200",
                        )}
                      >
                        <Power className="h-2.5 w-2.5" />
                        {s.enabled ? "ARMED" : "OFF"}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap gap-1">
                      <span data-testid="strategy-status" className={cn("num rounded px-1 py-0.5 text-[7px] font-semibold", style.className)}>{style.label}</span>
                      <span className="num rounded bg-[#1e293b] px-1 py-0.5 text-[7px] text-slate-300" data-testid="strategy-timeframe">{s.timeframe}</span>
                      <span className="num rounded bg-[#1e293b] px-1 py-0.5 text-[7px] text-slate-300">{s.leverage}x</span>
                      <span className="num rounded bg-[#1e293b] px-1 py-0.5 text-[7px] text-slate-300">TP {s.tp_pct}%</span>
                      <span className="num rounded bg-[#1e293b] px-1 py-0.5 text-[7px] text-slate-300">SL {s.sl_pct ?? "—"}%</span>
                    </div>

                    <p className="mt-1 text-[9px] leading-snug text-slate-400" data-testid="strategy-detail">
                      {s.detail}
                    </p>

                    <div className="num mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[7px] text-slate-500">
                      <span>{s.coin_pick === "top_loser" ? "top loser" : "top gainer"}</span>
                      <span>₹{s.capital_cap_inr.toLocaleString("en-IN")}</span>
                      <span data-testid="strategy-trades-today">{s.trades_today}/{s.max_trades_per_day} today</span>
                      {s.next_slot_ist ? <span>next {s.next_slot_ist}</span> : null}
                    </div>

                    {s.open_pair ? (
                      <div className="mt-1.5 rounded border border-[#1e293b] bg-[#0b0e14] px-1.5 py-1 text-[8px] text-slate-300">
                        <span className={s.open_side === "buy" ? "text-[#00c076]" : "text-[#ff455b]"}>
                          {s.open_side === "buy" ? "LONG" : "SHORT"} {s.open_pair}
                        </span>{" "}
                        <span className="num text-slate-400">@ {s.entry_price?.toFixed(4)} → TP {s.tp_price?.toFixed(4)}</span>
                        {s.sl_price ? <span className="num text-slate-400"> / SL {s.sl_price.toFixed(4)}</span> : null}
                      </div>
                    ) : null}

                    <div className="mt-auto flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(s);
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-700 bg-slate-800/80 px-1 py-0.75 text-[7px] font-medium text-slate-200"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(s.id);
                          if (typeof window !== "undefined") {
                            const deleteButton = document.querySelector(
                              `[data-testid="delete-strategy-button"]`,
                            ) as HTMLButtonElement | null;
                            deleteButton?.click();
                          }
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-1 py-0.75 text-[7px] font-medium text-red-300"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
