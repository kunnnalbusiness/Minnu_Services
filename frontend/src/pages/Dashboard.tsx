import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Bot, History, LogOut, TrendingUp } from "lucide-react";
import InstrumentTable from "@/components/dashboard/InstrumentTable";
import TopGainerBox from "@/components/dashboard/TopGainerBox";
import { useMarketStream } from "@/hooks/useMarketStream";
import { fmtPct } from "@/lib/types";
import type { Resolution, Ticker } from "@/lib/types";
import { cn } from "@/lib/utils";

const DEFAULT_RESOLUTION: Resolution = "5m";
const TIMEFRAME_STORAGE_KEY = "scalping-timeframes";

function istClock(): string {
  return new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false });
}

function loadTimeframes(): Record<string, Resolution> {
  try {
    const saved = JSON.parse(localStorage.getItem(TIMEFRAME_STORAGE_KEY) ?? "{}");
    return typeof saved === "object" && saved !== null ? saved : {};
  } catch {
    return {};
  }
}

const STATE_LABEL = {
  connecting: "Connecting to CoinDCX stream…",
  live: "Live · CoinDCX",
  offline: "Stream offline · retrying",
} as const;

function StatChip({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
      <span
        className={cn(
          "num text-[10px] font-semibold",
          tone === "up" ? "text-[#008f59]" : tone === "down" ? "text-[#d9364a]" : "text-[#273142]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const { snapshot, state, ticks } = useMarketStream();
  const [timeframes, setTimeframes] = useState<Record<string, Resolution>>(loadTimeframes);
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const isLightMobile = isMobile && document.documentElement.dataset.theme === "light";

  useEffect(() => {
    const id = setInterval(() => { void istClock(); }, 1000);
    return () => clearInterval(id);
  }, []);

  const instruments: Ticker[] = snapshot?.instruments ?? [];
  const top: Ticker[] = snapshot?.top ?? [];
  const best = instruments[0];
  const worst = instruments[instruments.length - 1];

  return (
    <div className={`terminal-shell flex h-screen flex-col overflow-hidden ${isLightMobile ? "bg-[var(--background)] text-slate-900" : "bg-[#0b0e14] text-slate-100"}`}>
      <header className={`flex h-13 shrink-0 items-center gap-x-3 border-b px-4 py-2 backdrop-blur-sm ${isLightMobile ? "border-[#dfeaf3] bg-white text-slate-900 shadow-sm" : "border-[#1d2d42] bg-[#0d1724] text-slate-100"}`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[#bfc6ce] bg-[#edf1f4] text-[#4b5563] shadow-sm">
            <Activity className="h-4 w-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="font-heading text-[12px] font-bold tracking-tight text-[#17202a]">
              Dashboard
            </h1>
          </div>
        </div>

        <div className="ml-auto flex items-center justify-end gap-x-3 sm:gap-x-5">
          <div className="hidden items-center gap-3 sm:flex">
            <StatChip label="Pairs" value={String(snapshot?.count ?? 0)} />
            <StatChip
              label="Top gainer"
              value={best ? `${best.symbol} ${fmtPct(best.change_pct)}` : "—"}
              tone="up"
            />
            <StatChip
              label="Top loser"
              value={worst ? `${worst.symbol} ${fmtPct(worst.change_pct)}` : "—"}
              tone="down"
            />
            <StatChip label="Frames" value={String(ticks)} />
          </div>

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <div className="hidden items-center gap-2 md:flex">
              <Link
                to="/bot"
                data-testid="bot-link"
                aria-label="Bot control"
                title="Bot control"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#334155] bg-[#111827] text-slate-300 transition-colors hover:text-white"
              >
                <Bot className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/history"
                data-testid="history-link"
                aria-label="Trade history"
                title="Trade history"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#334155] bg-[#111827] text-slate-300 transition-colors hover:text-white"
              >
                <History className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/logout", { method: "POST" });
                  window.location.assign("/login");
                }}
                aria-label="Logout"
                title="Logout"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#334155] bg-[#111827] text-slate-300 transition-colors hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
            <span
              data-testid="ws-status-badge"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                state === "live"
                  ? "border-[#00c076]/40 bg-[#00c076]/10 text-[#00c076]"
                  : state === "connecting"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                    : "border-[#ff455b]/40 bg-[#ff455b]/10 text-[#ff455b]",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  state === "live"
                    ? "bg-[#00c076] animate-[beacon_1.6s_ease-in-out_infinite]"
                    : state === "connecting"
                      ? "bg-amber-400"
                      : "bg-[#ff455b]",
                )}
              />
              {STATE_LABEL[state]}
            </span>
          </div>
        </div>
      </header>

      <div className={`mt-0 grid grid-cols-4 gap-1 border-b px-1.5 py-1 sm:hidden ${isLightMobile ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#111827]/80"}`}>
        <div className={`rounded-md border px-1 py-0.5 text-center ${isLightMobile ? "border-[#dfeaf3] bg-[var(--background)]" : "border-[#1e293b] bg-[#0b0e14]"}`}>
          <div className="text-[6.5px] uppercase tracking-[0.16em] text-slate-500">Pairs</div>
          <div className={`num mt-0.5 text-[10px] font-semibold ${isLightMobile ? "text-slate-900" : "text-slate-100"}`}>{snapshot?.count ?? 0}</div>
        </div>
        <div className={`rounded-md border px-1 py-0.5 text-center ${isLightMobile ? "border-[#dfeaf3] bg-[var(--background)]" : "border-[#1e293b] bg-[#0b0e14]"}`}>
          <div className="text-[6.5px] uppercase tracking-[0.16em] text-slate-500">Top Gainer</div>
          <div className="num mt-0.5 text-[8.5px] font-semibold text-[#00c076]">
            {best ? `${best.symbol} ${fmtPct(best.change_pct)}` : "—"}
          </div>
        </div>
        <div className={`rounded-md border px-1 py-0.5 text-center ${isLightMobile ? "border-[#dfeaf3] bg-[var(--background)]" : "border-[#1e293b] bg-[#0b0e14]"}`}>
          <div className="text-[6.5px] uppercase tracking-[0.16em] text-slate-500">Top Loser</div>
          <div className="num mt-0.5 text-[8.5px] font-semibold text-[#ff455b]">
            {worst ? `${worst.symbol} ${fmtPct(worst.change_pct)}` : "—"}
          </div>
        </div>
        <div className={`rounded-md border px-1 py-0.5 text-center ${isLightMobile ? "border-[#dfeaf3] bg-[var(--background)]" : "border-[#1e293b] bg-[#0b0e14]"}`}>
          <div className="text-[6.5px] uppercase tracking-[0.16em] text-slate-500">Frames</div>
          <div className={`num mt-0.5 text-[10px] font-semibold ${isLightMobile ? "text-slate-900" : "text-slate-100"}`}>{ticks}</div>
        </div>
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-1 overflow-y-auto overflow-x-hidden p-1.5 sm:gap-1.5 sm:overflow-hidden sm:p-2 lg:grid-cols-12 lg:items-start lg:gap-4 lg:overflow-hidden lg:p-3">
        <section className="terminal-panel min-h-0 min-w-0 lg:col-span-7 lg:min-h-0 xl:col-span-8">
          <InstrumentTable instruments={instruments} />
        </section>

        <section
          className="terminal-panel flex min-h-0 max-w-full flex-col gap-1.5 overflow-hidden lg:order-none lg:col-span-5 lg:gap-2 xl:col-span-4"
          role="region"
          aria-label="Top 4 Crypto Gainers"
        >
          <div className={`flex items-center gap-2 px-0.5 ${isLightMobile ? "text-slate-900" : "text-slate-100"}`}>
            <TrendingUp className="h-3.5 w-3.5 text-[#00c076]" />
            <h2 className={`font-heading text-[11px] font-semibold tracking-tight sm:text-sm ${isLightMobile ? "text-slate-900" : "text-slate-100"}`}>
              Top 4 Movers · Live OHLC
            </h2>
            <span className="num ml-auto text-[9px] text-slate-500 sm:text-[10px]">re-ranked every second</span>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2 gap-1 overflow-hidden sm:gap-2.5">
            {top.length > 0
              ? top.map((t, i) => (
                  <TopGainerBox
                    key={t.pair}
                    ticker={t}
                    rank={i + 1}
                    resolution={timeframes[t.pair] ?? DEFAULT_RESOLUTION}
                    onResolutionChange={(value) => {
                      setTimeframes((prev) => {
                        const next = { ...prev, [t.pair]: value };
                        localStorage.setItem(TIMEFRAME_STORAGE_KEY, JSON.stringify(next));
                        return next;
                      });
                    }}
                  />
                ))
              : [0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    data-testid="top-gainer-placeholder"
                    className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-[#1e293b] bg-[#0d111a] text-[11px] text-slate-600"
                  >
                    Awaiting stream…
                  </div>
                ))}
          </div>
        </section>
      </main>

    </div>
  );
}
