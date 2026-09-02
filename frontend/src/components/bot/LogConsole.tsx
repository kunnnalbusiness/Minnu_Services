import { Fragment, useEffect, useRef, useState } from "react";
import { LEVEL_STYLE } from "@/lib/botTypes";
import type { LogEntry, Strategy } from "@/lib/botTypes";
import { cn } from "@/lib/utils";

export default function LogConsole({ logs, strategies }: { logs: LogEntry[]; strategies: Strategy[] }) {
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowLive = useRef(true);
  const [selectedStrategy, setSelectedStrategy] = useState("all");
  const isLightMode = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";

  useEffect(() => {
    if (shouldFollowLive.current) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [logs]);

  useEffect(() => {
    if (selectedStrategy !== "all" && !strategies.some((strategy) => strategy.id === selectedStrategy)) {
      setSelectedStrategy("all");
    }
  }, [selectedStrategy, strategies]);

  const isCycleStart = (msg: string) => {
    return msg.includes("Pre-trade scan") || (msg.includes("Strategy") && msg.includes("armed"));
  };

  const displayMessage = (message: string): string => {
    const formatTime = (value: string, suffix = false): string => {
      const [hoursText, minutes] = value.split(":");
      const hours = Number(hoursText);
      if (!Number.isInteger(hours) || hours < 0 || hours > 23) return value;
      const period = hours >= 12 ? "pm" : "am";
      const hour12 = hours % 12 || 12;
      return `${String(hour12).padStart(2, "0")}:${minutes}${suffix ? period : ""}`;
    };

    // Keep persisted candle intervals readable, including old calculation artifacts.
    return message.replace(
      /(close time \(|Green \(|Red \()([0-9]{1,2}:[0-9]{2})(?: ?([AP]M|am|pm))?\s*-\s*([0-9]{1,2}:[0-9]{2})(?: ?([AP]M|am|pm))?(?:\s*=\s*([0-9]{1,2}:[0-9]{2})(?: ?([AP]M|am|pm))?)?/gi,
      (_match, prefix: string, start: string, startPeriod: string | undefined, end: string, endPeriod: string | undefined, calculated: string | undefined, calculatedPeriod: string | undefined) => {
        const startValue = startPeriod ? `${start}${startPeriod}` : formatTime(start);
        const endValue = endPeriod ? `${end}${endPeriod}` : formatTime(end);
        if (!calculated) return `${prefix}${startValue} - ${endValue}`;
        const calculatedValue = calculatedPeriod
          ? `${calculated}${calculatedPeriod}`
          : formatTime(calculated, true);
        return `${prefix}${startValue} - ${endValue} = ${calculatedValue}`;
      },
    );
  };

  const reasonFor = (log: LogEntry): string | null => {
    const message = log.message.toLowerCase();
    if (message.includes("not tradable") || message.includes("no usable inr-margin")) {
      return "Skipped: no active INR-margin contract is available for this pair.";
    }
    if (message.includes("candle closed flat") || message.includes("doji")) {
      return "Skipped: candle was flat, so no buy or sell direction was confirmed.";
    }
    if (message.includes("no candidate") || message.includes("no positive")) {
      return "Skipped: no eligible candle or positive mover matched this cycle.";
    }
    if (message.includes("timeout")) {
      return "Skipped: the allowed trigger or fill time expired.";
    }
    if (message.includes("cancelled") || message.includes("canceled")) {
      return "Skipped: order was not filled within its allowed window.";
    }
    if (message.includes("eliminated")) {
      return "Skipped: the candle sequence didn't match Green to Red, so this pair was eliminated for the cycle.";
    }
    if (message.includes("condition match")) {
      return "Signal detail: the required Green to Red candle sequence was confirmed.";
    }
    if (message.includes("pre-trade scan")) {
      return "Scan detail: candidates were ranked from the live CoinDCX market feed.";
    }
    if (log.level === "error") {
      return "Action detail: this step failed; the message above contains the exchange or API response.";
    }
    return null;
  };

  const presentationFor = (log: LogEntry) => {
    const message = displayMessage(log.message);
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("pre-trade scan")) {
      return { label: "SCAN", body: message.replace(/^Pre-trade scan \([^)]*\):\s*/i, "Ranked feed: ") };
    }
    if (lowerMessage.includes("candle 1 (cn1)")) {
      return { label: "EVAL", body: message };
    }
    if (lowerMessage.includes("eliminated")) {
      return { label: "STATUS", body: message, status: "eliminated" as const };
    }
    if (lowerMessage.includes("condition match")) {
      const selectedPair = message.match(/Selected for trade:\s*(.+?);\s*starting 1m trigger scan\.?$/i)?.[1];
      return {
        label: "MATCH",
        body: selectedPair
          ? `Selected for trade: ${selectedPair} | Starting 1m trigger scan.`
          : message.replace(/^Condition Match\s*-\s*/i, ""),
        status: "confirmed" as const,
      };
    }
    if (lowerMessage.includes("fetching ") && lowerMessage.includes("ohlc")) {
      return { label: "TRIGGER", body: message };
    }
    if (lowerMessage.includes("waiting for the") && lowerMessage.includes("candle to close")) {
      return { label: "WAIT", body: message };
    }
    return { label: log.level.toUpperCase(), body: message };
  };

  const visibleLogs = selectedStrategy === "all"
    ? logs
    : logs.filter((log) => log.strategy_id === selectedStrategy);

  return (
    <div className={`flex h-[clamp(360px,62vh,680px)] min-h-0 flex-col overflow-hidden rounded-lg border lg:h-full ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]"}`}>
      <div className={`flex items-center justify-between border-b px-2.5 py-1.5 sm:px-3 sm:py-2.5 ${isLightMode ? "border-[#dfeaf3]" : "border-[#1e293b]"}`}>
        <h2 className={`font-heading text-[11px] font-semibold sm:text-sm ${isLightMode ? "text-slate-900" : "text-slate-100"}`}>Live Log Console</h2>
        <span className="num text-[9px] text-slate-500 sm:text-[11px]" data-testid="log-count">
          {visibleLogs.length} events
        </span>
      </div>

      <div className={`flex min-w-0 gap-1 overflow-x-auto border-b px-2 py-1 ${isLightMode ? "border-[#dfeaf3] bg-[#f1f7fd]" : "border-[#1e293b] bg-[#0a0f18]"}`} role="tablist" aria-label="Strategy logs">
        <button
          type="button"
          role="tab"
          aria-selected={selectedStrategy === "all"}
          onClick={() => setSelectedStrategy("all")}
          className={cn(
            "shrink-0 rounded px-2 py-1 text-[8px] font-semibold transition-colors sm:px-2.5 sm:text-[10px]",
            selectedStrategy === "all" ? "bg-[#00c076]/15 text-[#00c076]" : "text-slate-500 hover:bg-[#151e2d] hover:text-slate-200",
          )}
        >
          All logs
        </button>
        {strategies.map((strategy) => {
          const active = selectedStrategy === strategy.id;
          const count = logs.filter((log) => log.strategy_id === strategy.id).length;
          return (
            <button
              key={strategy.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedStrategy(strategy.id)}
              className={cn(
                "flex max-w-[220px] shrink-0 items-center gap-1 rounded px-2 py-1 text-[8px] font-semibold transition-colors sm:px-2.5 sm:text-[10px]",
                active ? "bg-[#00c076]/15 text-[#00c076]" : "text-slate-500 hover:bg-[#151e2d] hover:text-slate-200",
              )}
            >
              <span className="truncate">{strategy.name}</span>
              <span className="num text-[9px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid min-w-0 grid-cols-[40px_45px_40px_minmax(0,1fr)] gap-1.5 border-b border-[#1e293b]/60 bg-[#0f172a]/60 px-2 py-1 text-[7px] font-semibold uppercase tracking-wider text-slate-400 sm:grid-cols-[80px_70px_120px_minmax(0,1fr)] sm:gap-2.5 sm:px-3 sm:text-[10px]">
        <span className="truncate">Time</span>
        <span className="truncate">Level</span>
        <span className="truncate">Strategy</span>
        <span className="min-w-0 truncate">Message & Reason</span>
      </div>

      <div
        ref={logContainerRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          shouldFollowLive.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono"
        data-testid="log-console"
        aria-live="polite"
      >
        {visibleLogs.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500" data-testid="log-empty-state">
            No events yet. Switch the bot on, or force-run a strategy to see signals here.
          </p>
        ) : (
          <div className="min-w-0">
            {visibleLogs.map((log, index) => {
              const showDivider = isCycleStart(log.message) && index > 0;
              const lowerMessage = log.message.toLowerCase();
              const presentation = presentationFor(log);
              const isLossTrade = log.level === "trade" && (
                lowerMessage.includes("stop loss hit") ||
                lowerMessage.includes("sl hit") ||
                lowerMessage.includes("loss")
              );
              const messageClass = isLossTrade ? "text-[#ff455b]" : LEVEL_STYLE[log.level];
              return (
                <Fragment key={log.id || index}>
                  {showDivider && (
                    <div className="my-3 h-[1px] w-full bg-slate-800/80" role="separator" />
                  )}

                  <div
                    data-testid="log-line"
                    data-level={log.level}
                    className="grid min-w-0 grid-cols-[40px_45px_40px_minmax(0,1fr)] gap-1.5 border-b border-slate-900/40 py-1 text-[7px] leading-relaxed hover:bg-slate-900/20 sm:grid-cols-[80px_70px_120px_minmax(0,1fr)] sm:gap-2.5 sm:text-[11px]"
                  >
                    <span className="shrink-0 text-slate-500">{log.ts.slice(11, 19)}</span>
                    <span className="shrink-0 font-semibold uppercase text-slate-400">[{log.level}]</span>
                    <span className="truncate text-slate-400" title={log.strategy_name || ""}>
                      {log.strategy_name || "—"}
                    </span>
                    <div className="min-w-0 overflow-hidden">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <span
                          className={cn(
                            "mt-0.5 inline-flex min-w-[46px] shrink-0 items-center border-l-2 px-1 text-[7px] font-bold tracking-[0.14em] sm:min-w-[52px] sm:px-1.5 sm:text-[9px]",
                            presentation.status === "eliminated"
                              ? "border-l-rose-400 text-rose-300"
                              : presentation.status === "confirmed"
                                ? "border-l-emerald-400 text-emerald-300"
                                : "border-l-slate-500 text-slate-400",
                          )}
                        >
                          {presentation.label}
                        </span>
                        <span className={cn("min-w-0 flex-1 break-words whitespace-normal text-[8px] sm:text-[10px]", messageClass)}>{presentation.body}</span>
                      </div>
                      {presentation.status === "eliminated" ? (
                        <div className="mt-1 border-l border-rose-400/40 pl-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-rose-300/90 sm:text-[10px]">
                          Status: sequence eliminated; only Green to Red qualifies.
                        </div>
                      ) : presentation.status === "confirmed" ? (
                        <div className="mt-1 border-l border-emerald-400/40 pl-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-emerald-300/90 sm:text-[10px]">
                          Status: Green to Red confirmed; candidate match.
                        </div>
                      ) : reasonFor(log) ? (
                        <span className={cn(
                          "mt-1 block break-words whitespace-normal text-[8px] leading-relaxed sm:text-[10px]",
                          log.level === "error" ? "text-rose-300/90" : "text-amber-300/90",
                        )}>
                          {reasonFor(log)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}