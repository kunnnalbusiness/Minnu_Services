import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, MapPin } from "lucide-react";
import PnlCalendar from "@/components/bot/PnlCalendar";
import TradePositionCard from "@/components/bot/TradePositionCard";
import { apiGet } from "@/lib/api";
import { fmtInr } from "@/lib/botTypes";
import type { DayPnl, TodaySummary, Trade } from "@/lib/botTypes";
import { cn } from "@/lib/utils";

function istClock(): string {
  return new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false });
}

function istDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export default function TradeHistory() {
  const [clock, setClock] = useState(istClock);
  const [selectedDate, setSelectedDate] = useState(istDate);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const isLightMode = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";

  useEffect(() => {
    const updateView = () => setIsMobile(window.innerWidth < 768);
    updateView();
    window.addEventListener("resize", updateView);
    return () => window.removeEventListener("resize", updateView);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(istClock()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = useQuery({
    queryKey: ["bot-history-today"],
    queryFn: () => apiGet<TodaySummary>("/bot/history/today"),
    refetchInterval: 10000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const daily = useQuery({
    queryKey: ["bot-history-daily"],
    queryFn: () => apiGet<DayPnl[]>("/bot/history/daily?days=200"),
    refetchInterval: 30000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const selectedTrades = useQuery({
    queryKey: ["bot-history-trades", selectedDate],
    queryFn: () => apiGet<Trade[]>(`/bot/trades?date=${encodeURIComponent(selectedDate)}&limit=200`),
    refetchInterval: 10000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setSelectedTradeId(null);
  }, [selectedDate]);

  const summary = today.data ?? null;
  const selectedDaySummary = useMemo(() => {
    const trades = selectedTrades.data ?? [];
    const pnl = trades.reduce((sum, trade) => sum + (trade.pnl_inr ?? 0), 0);
    const targetInr = summary?.target_inr ?? 25000;
    return {
      date: selectedDate,
      pnl_inr: pnl,
      target_inr: targetInr,
      target_achieved: targetInr > 0 && pnl >= targetInr,
      trades_done: trades.length,
      max_trades: summary?.max_trades ?? 50,
    };
  }, [selectedDate, selectedTrades.data, summary?.target_inr, summary?.max_trades]);

  const pnl = selectedDaySummary.pnl_inr;
  const achieved = selectedDaySummary.target_achieved;
  const selectedTrade = selectedTrades.data?.find((trade) => trade.id === selectedTradeId) ?? null;
  const selectedTradeIsRunning = selectedTrade?.status === "open" || selectedTrade?.status === "pending";
  const showSelectedTradeDetails = !isMobile && selectedTrade && !selectedTradeIsRunning;
  const themeText = isLightMode ? "text-slate-900" : "text-slate-100";
  const themeMuted = isLightMode ? "text-slate-600" : "text-slate-400";
  const themeCard = isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]";

  return (
    <div className={`flex min-h-screen flex-col lg:h-screen lg:overflow-hidden ${isLightMode ? "bg-[var(--background)] text-slate-900" : "bg-[#0b0e14] text-slate-100"}`}>
      <header className={`flex h-13 shrink-0 items-center gap-x-3 border-b px-4 py-2 backdrop-blur-sm ${isLightMode ? "border-[#dfeaf3] bg-white text-slate-900 shadow-sm" : "border-[#1d2d42] bg-[#0d1724] text-slate-100"}`}>
        <div className="hidden md:flex md:w-full md:items-center md:gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded bg-[#ff455b]/15 text-[#ff455b]">
              <History className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <h1 className={`font-heading text-[12px] font-bold tracking-tight ${themeText}`}>Trade History</h1>
              <p className={`num text-[9px] ${themeMuted}`}>realised P&amp;L and daily target</p>
            </div>
          </div>
        </div>

        <div className={`flex w-full items-center justify-between gap-3 md:hidden ${isLightMode ? "text-slate-900" : "text-slate-100"}`}>
          <div className="flex min-w-0 items-center gap-2">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border shadow-sm ${isLightMode ? "border-[#dfeaf3] bg-[#f8fbff] text-[#4b5563]" : "border-[#bfc6ce] bg-[#edf1f4] text-[#4b5563]"}`}>
              <History className="h-4 w-4" />
            </span>
            <div className="min-w-0 leading-tight">
              <h1 className={`font-heading text-[12px] font-bold tracking-tight ${themeText}`}>Trade History</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-0 w-full max-w-[1800px] flex-1 content-start grid-cols-1 gap-1 overflow-y-auto p-1 lg:grid-cols-[420px_minmax(0,1fr)] lg:overflow-hidden lg:gap-2 lg:p-4">
        <section className="order-1 sticky top-0 z-20 flex h-fit min-h-0 min-w-0 shrink-0 self-start flex-col gap-1 bg-[var(--background)] pt-0 md:hidden">
          <div className="grid grid-cols-3 gap-1 pt-0">
            <div className={`min-w-0 rounded-md border p-1 ${themeCard}`} data-testid="date-box">
              <p className={`text-[7px] uppercase tracking-[0.12em] ${themeMuted}`}>Date</p>
              <p className={`num mt-0.5 text-[11px] font-semibold ${isLightMode ? "text-[#3d5ef5]" : "text-[#7f9bff]"}`}>
                {selectedDaySummary.date ?? "—"}
              </p>
            </div>
            <div className={`min-w-0 rounded-md border p-1 ${themeCard}`} data-testid="today-pnl-box">
              <p className={`text-[7px] uppercase tracking-[0.12em] ${themeMuted}`}>P&amp;L</p>
              <p
                className={cn(
                  "num mt-0.5 text-[11px] font-semibold",
                  pnl > 0 ? "text-[#00c076]" : pnl < 0 ? "text-[#ff455b]" : "text-slate-300",
                )}
              >
                {fmtInr(pnl)}
              </p>
            </div>
            <div
              data-testid="target-box"
              className={cn(
                "min-w-0 rounded-md border p-1",
                achieved ? "border-[#00c076]/50 bg-[#00c076]/[0.08]" : "border-[#ff455b]/40 bg-[#ff455b]/[0.06]",
              )}
            >
              <p className={`text-[7px] uppercase tracking-[0.12em] ${themeMuted}`}>
                {achieved ? "Achieved" : "Not achieved"}
              </p>
              <p
                className={cn(
                  "num mt-0.5 text-[9px] font-semibold",
                  achieved ? "text-[#00c076]" : "text-[#ff455b]",
                )}
              >
                {fmtInr(selectedDaySummary.target_inr).replace("+", "")}
              </p>
            </div>
          </div>
        </section>

        <section className="order-2 min-h-0 self-start overflow-y-auto pb-1 lg:order-2 lg:overflow-y-auto">
          <div className={`rounded-lg border ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]"}`}>
            <button
              type="button"
              onClick={() => setCalendarOpen((value) => !value)}
              className="flex w-full items-center justify-between px-2.5 py-1.5 text-left md:px-3 md:py-2"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded bg-[#ff455b]/10 text-[#ff455b] md:h-7 md:w-7">
                  <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </span>
                <div>
                  <h2 className={`font-heading text-[11px] font-semibold ${themeText} md:text-xs`}>Calendar</h2>
                  <p className={`mt-0.5 text-[9px] ${themeMuted} md:text-[10px]`}>Select a date for trade review</p>
                </div>
              </div>
              <span className="num text-[9px] text-slate-400 md:text-[10px]">{calendarOpen ? "Hide" : "Show"}</span>
            </button>
            {calendarOpen ? (
              <div className={`border-t p-1.5 md:p-2 ${isLightMode ? "border-[#dfeaf3]" : "border-[#1e293b]"}`}>
                <PnlCalendar
                  days={daily.data ?? []}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                />
              </div>
            ) : null}
          </div>
          <section className={`mt-1.5 overflow-hidden rounded-lg border md:mt-2 ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]"}`} data-testid="calendar-trades-section">
            <div className={`flex items-center justify-between border-b px-2.5 py-1.5 md:px-3 md:py-2 ${isLightMode ? "border-[#dfeaf3]" : "border-[#1e293b]"}`}>
              <div>
                <h2 className={`font-heading text-[11px] font-semibold ${themeText} md:text-sm`}>Trades on {selectedDate}</h2>
                <p className={`mt-0.5 text-[9px] ${themeMuted} md:text-[10px]`}>Select a trade to view its complete position details.</p>
              </div>
              <span className="num text-[10px] text-slate-500" data-testid="today-trade-count">
                {selectedTrades.data?.length ?? 0} logged
              </span>
            </div>
            {selectedTrades.data && selectedTrades.data.length > 0 ? (
              <div className="flex flex-col gap-1.5 overflow-hidden p-1.5 md:overflow-visible">
                {selectedTrades.data.map((trade) => (
                  <TradePositionCard
                    key={trade.id}
                    record={trade}
                    expanded={isMobile ? selectedTradeId === trade.id : false}
                    showChevron={true}
                    onToggle={() => {
                      const nextId = selectedTradeId === trade.id ? null : trade.id;
                      setSelectedTradeId(nextId);
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="px-3 py-8 text-center text-xs text-slate-500" data-testid="today-trades-empty">
                No trades logged for {selectedDate}.
              </p>
            )}
          </section>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col gap-2 lg:overflow-y-auto">

          {showSelectedTradeDetails ? (
            <section className={`rounded-lg border p-2.5 ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]"}`} data-testid="selected-trade-details">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-heading text-sm font-semibold text-slate-100">Trade details</h2>
                <span className="num text-[11px] text-slate-500">{selectedTrade.pair.replace("B-", "")}</span>
              </div>
              <TradePositionCard
                record={selectedTrade}
                expanded
                showChevron={false}
                onToggle={() => undefined}
              />
            </section>
          ) : null}

        </section>
      </main>

      <footer
        data-testid="scanning-footer"
        className={`num hidden h-9 shrink-0 items-center justify-between border-t px-4 text-[11px] md:flex ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)] text-slate-600" : "border-[#1e293b] bg-[#090c11] text-slate-400"}`}
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00c076] animate-[beacon_1.6s_ease-in-out_infinite]" />
          Live feed
        </span>
        <span data-testid="ist-clock" className={isLightMode ? "text-slate-700" : "text-slate-300"}>
          {clock}
        </span>
      </footer>
    </div>
  );
}
