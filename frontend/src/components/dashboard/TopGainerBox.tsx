import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import CandleChart from "@/components/dashboard/CandleChart";
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { apiGet } from "@/lib/api";
import { RESOLUTIONS, fmtCompact, fmtPct, fmtPrice } from "@/lib/types";
import type { CandleSeries, Resolution, Ticker } from "@/lib/types";
import { cn } from "@/lib/utils";

const RANK_ACCENT = ["#F5C451", "#C7D2DC", "#CD7F45", "#00C076"];

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-center justify-between gap-1.5 leading-none">
      <span className="text-[6.5px] uppercase tracking-wider text-slate-500 md:text-[10px]">{label}</span>
      <span
        data-testid={`ohlc-${label.toLowerCase()}`}
        className={cn(
          "num truncate text-[7.5px] font-medium md:text-[12px]",
          tone === "up" ? "text-[#00c076]" : tone === "down" ? "text-[#ff455b]" : "text-[#e2e8f0]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function TopGainerBox({
  ticker,
  rank,
  resolution,
  onResolutionChange,
}: {
  ticker: Ticker;
  rank: number;
  resolution: Resolution;
  onResolutionChange: (value: Resolution) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const isLightMobile = isMobile && document.documentElement.dataset.theme === "light";
  const up = ticker.change_pct >= 0;
  const accent = RANK_ACCENT[rank - 1] ?? "#00C076";
  const chartHeight = expanded ? Math.round((isMobile ? 170 : 260) * zoom) : isMobile ? 34 : 76;

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);

  const series = useQuery({
    queryKey: ["candles", ticker.pair, resolution],
    queryFn: () =>
      apiGet<CandleSeries>(`/market/candles/${ticker.pair}?resolution=${resolution}&limit=60`),
    refetchInterval: 10_000,
    retry: false,
    placeholderData: (prev) => prev,
  });

  return (
    <div
      data-testid="top-gainer-box"
      data-pair={ticker.pair}
      role="button"
      tabIndex={0}
      aria-label={`${ticker.symbol} details. Click to ${expanded ? "minimize" : "expand"}`}
      onClick={() => setExpanded((value) => !value)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setExpanded((value) => !value);
        }
      }}
      className={cn(
        "flex min-h-0 h-full w-full max-w-full flex-col gap-0.5 overflow-hidden rounded-lg border p-1.25 transition-[border-color] duration-200 hover:border-[#00c076]/40 sm:gap-1.5 sm:p-2 md:gap-2 md:p-2.5",
        isLightMobile ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#111724]",
        expanded && "fixed inset-3 z-50 overflow-y-auto shadow-2xl shadow-black/60 sm:inset-5 lg:inset-8",
      )}
      style={{
        boxShadow: `inset 2px 0 0 0 ${accent}`,
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-[#1e293b]/60 pb-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`num text-[9px] font-semibold sm:text-[11px] md:text-[13px] ${isLightMobile ? "text-slate-900" : "text-white"}`} data-testid="top-box-symbol">
            {ticker.symbol}
          </span>
          <span className={`num rounded border px-1 py-0.5 text-[6.5px] sm:text-[7px] ${isLightMobile ? "border-[#dfeaf3] bg-[var(--background)] text-slate-700" : "border-[#1e293b] bg-[#0b0e14] text-slate-300"}`}>
            {ticker.max_leverage ? `${ticker.max_leverage}x` : "—"}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 text-right">
            <div className={`text-[6px] uppercase tracking-[0.08em] ${isLightMobile ? "text-slate-500" : "text-slate-500"}`}>Last</div>
            <span className={`num block truncate text-[9px] font-semibold leading-none sm:text-[11px] md:text-[17px] ${isLightMobile ? "text-slate-900" : "text-white"}`} data-testid="top-box-price">
              {fmtPrice(ticker.last)}
            </span>
          </div>

          <div className="min-w-0 text-right">
            <div className={`text-[6px] uppercase tracking-[0.08em] ${isLightMobile ? "text-slate-500" : "text-slate-500"}`}>24H</div>
            <span
              data-testid="top-box-change"
              className={cn(
                "num inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-[7px] font-semibold leading-none sm:text-[8px] md:text-[12px]",
                up ? "bg-[#00c076]/10 text-[#00c076]" : "bg-[#ff455b]/10 text-[#ff455b]",
              )}
            >
              {up ? "↑" : "↓"}
              {fmtPct(ticker.change_pct)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="hidden sm:flex sm:items-center sm:gap-1">
              <button
                type="button"
                title="Zoom out"
                aria-label="Zoom out"
                disabled={zoom <= 0.85}
                onClick={(event) => {
                  event.stopPropagation();
                  setZoom((value) => Math.max(0.85, Number((value - 0.15).toFixed(2))));
                }}
                className="grid size-6 place-items-center rounded text-slate-400 hover:bg-[#1e293b] hover:text-white disabled:opacity-40"
              >
                <ZoomOut className="size-3.5" />
              </button>
              <button
                type="button"
                title="Zoom in"
                aria-label="Zoom in"
                disabled={zoom >= 1.5}
                onClick={(event) => {
                  event.stopPropagation();
                  setZoom((value) => Math.min(1.5, Number((value + 0.15).toFixed(2))));
                }}
                className="grid size-6 place-items-center rounded text-slate-400 hover:bg-[#1e293b] hover:text-white disabled:opacity-40"
              >
                <ZoomIn className="size-3.5" />
              </button>
              <button
                type="button"
                title={expanded ? "Minimize card" : "Expand card"}
                aria-label={expanded ? "Minimize card" : "Expand card"}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded((value) => !value);
                }}
                className="grid size-6 place-items-center rounded text-slate-400 hover:bg-[#1e293b] hover:text-white"
              >
                {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </button>
          </div>
          <span
            className="num rounded px-1 py-0.5 text-[8px] font-bold md:text-[10px]"
            style={{ color: accent, backgroundColor: `${accent}1F` }}
            data-testid="top-box-rank"
          >
            #{rank}
          </span>
        </div>
      </div>

      <div
        className={`rounded-md border p-0.5 ${isLightMobile ? "border-[#dfeaf3] bg-[var(--background)]" : "border-[#1e293b] bg-[#0b0e14]"}`}
        role="group"
        aria-label={`Timeframe for ${ticker.symbol}`}
        data-testid="timeframe-selector"
      >
        <div className="flex flex-wrap gap-0.5">
          {RESOLUTIONS.map((r) => (
            <button
              key={r}
              type="button"
              data-testid={`timeframe-${r}-button`}
              aria-pressed={resolution === r}
              onClick={(event) => {
                event.stopPropagation();
                onResolutionChange(r);
              }}
              className={cn(
                "num flex-1 rounded px-0.5 py-0.5 text-[6.5px] font-medium transition-colors duration-150 sm:text-[8px] md:px-1.5 md:text-[10px]",
                resolution === r
                  ? "bg-[#00c076]/15 text-[#00c076]"
                  : "text-slate-500 hover:bg-[#1e293b] hover:text-slate-200",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <CandleChart
        candles={series.data?.candles ?? []}
        ticker={ticker}
        loading={series.isPending}
        height={chartHeight}
      />

      <div className={`grid grid-cols-2 gap-x-2 gap-y-0.5 border-t pt-1 sm:gap-x-3 sm:gap-y-1 sm:pt-2 ${isLightMobile ? "border-[#dfeaf3]" : "border-[#1e293b]"}`}>
        <Metric label="Open" value={fmtPrice(ticker.open)} />
        <Metric label="High" value={fmtPrice(ticker.high)} tone="up" />
        <Metric label="Low" value={fmtPrice(ticker.low)} tone="down" />
        <Metric label="Close" value={fmtPrice(ticker.last)} />
      </div>

      <div className={`num flex items-center justify-between gap-1 text-[6.5px] sm:text-[8px] md:text-[10px] ${isLightMobile ? "text-slate-500" : "text-slate-500"}`}>
        <span className="truncate">Vol {fmtCompact(ticker.volume)}</span>
        <span className="truncate">Funding {(ticker.funding_rate * 100).toFixed(4)}%</span>
      </div>
    </div>
  );
}
