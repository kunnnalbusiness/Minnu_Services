import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radar } from "lucide-react";
import { CandlestickSeries, ColorType, HistogramSeries, LineStyle, createChart } from "lightweight-charts";
import type { UTCTimestamp } from "lightweight-charts";
import { apiGet } from "@/lib/api";
import { fmtInr } from "@/lib/botTypes";
import type { LivePosition } from "@/lib/botTypes";
import type { CandleSeries } from "@/lib/types";
import { fmtPrice } from "@/lib/types";
import { useBotStream } from "@/hooks/useBotStream";
import { cn } from "@/lib/utils";

const EMPTY_POSITIONS: LivePosition[] = [];
const CHART_RESOLUTIONS = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"] as const;

function chartTime(value: number): UTCTimestamp {
  // Ensure value is in seconds (convert from milliseconds if needed)
  const seconds = Math.abs(value) >= 1_000_000_000_000 ? value / 1000 : value;
  return Math.floor(seconds) as UTCTimestamp;
}

/** Candles with entry / TP / SL levels drawn across them. */
function PositionChart({ position }: { position: LivePosition }) {
  const [resolution, setResolution] = useState<string>("1m");
  const chartRef = useRef<HTMLDivElement | null>(null);
  const isFirstRenderRef = useRef(true);
  const isLightMode = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  const series = useQuery({
    queryKey: ["position-candles", position.pair, resolution],
    queryFn: () =>
      apiGet<CandleSeries>(`/market/candles/${position.pair}?resolution=${resolution}&limit=60`),
    refetchInterval: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const candles = series.data?.candles ?? [];
  const levels = [position.entry_price, position.tp_price, position.sl_price ?? undefined, position.last_price ?? undefined].filter(
    (v): v is number => typeof v === "number" && v > 0,
  );

  useEffect(() => {
    const container = chartRef.current;
    if (!container || candles.length < 2 || levels.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: "#0b0e14" },
        textColor: "#94a3b8",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#172033", style: LineStyle.Solid },
        horzLines: { color: "#172033", style: LineStyle.Solid },
      },
      crosshair: {
        vertLine: { color: "#64748b", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#0f172a" },
        horzLine: { color: "#64748b", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#0f172a" },
      },
      rightPriceScale: {
        borderColor: "#263247",
        scaleMargins: { top: 0.08, bottom: 0.18 },
      },
      timeScale: {
        borderColor: "#263247",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
        minBarSpacing: 5,
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00c076",
      downColor: "#ff455b",
      borderUpColor: "#00c076",
      borderDownColor: "#ff455b",
      wickUpColor: "#00c076",
      wickDownColor: "#ff455b",
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    candleSeries.setData(
      candles
        .map((candle) => ({
          time: chartTime(candle.time),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }))
        .sort((left, right) => left.time - right.time),
    );

    // Draw vertical line at entry time using chart coordinate conversion
    const entryTime = chartTime(new Date(position.opened_at).getTime() / 1000);
    const entryCoord = chart.timeScale().timeToCoordinate(entryTime);

    if (entryCoord !== null) {
      // Create SVG overlay for vertical entry line
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("style", "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;");
      svg.setAttribute("viewBox", `0 0 ${container.clientWidth} 420`);
      svg.setAttribute("width", String(container.clientWidth));
      svg.setAttribute("height", "420");

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      const lineX = (entryCoord / container.clientWidth) * container.clientWidth;
      line.setAttribute("x1", String(lineX));
      line.setAttribute("y1", "0");
      line.setAttribute("x2", String(lineX));
      line.setAttribute("y2", "420");
      line.setAttribute("stroke", "#ffffff");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("stroke-dasharray", "4,4");

      svg.appendChild(line);
      container.style.position = "relative";
      container.appendChild(svg);
    }

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
      color: "#1f6feb",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
      visible: false,
    });
    volumeSeries.setData(
      candles
        .map((candle) => ({
          time: chartTime(candle.time),
          value: candle.volume,
          color: candle.close >= candle.open ? "#00c07655" : "#ff455b55",
        }))
        .sort((left, right) => left.time - right.time),
    );

    [

      { value: position.tp_price, color: "#00c076", title: "TP" },
      ...(position.sl_price ? [{ value: position.sl_price, color: "#ff455b", title: "SL" }] : []),
      ...(position.last_price ? [{ value: position.last_price, color: "#f5c451", title: "LIVE" }] : []),
    ].forEach(({ value, color, title }) => {
      candleSeries.createPriceLine({
        price: value,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      });
    });

    chart.timeScale().fitContent();

    // Track first render to avoid auto-fit on subsequent updates for live positions
    isFirstRenderRef.current = false;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth, height: 420 });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candles, levels, position.entry_price, position.tp_price, position.sl_price, position.last_price]);

  const chartControls = (
    <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]"}`}>
      <div>
        <span className={`text-[10px] uppercase tracking-wider ${isLightMode ? "text-slate-600" : "text-slate-500"}`}>Price chart · IST+5:30</span>
        <span className={`num ml-3 text-[10px] ${isLightMode ? "text-slate-600" : "text-slate-500"}`}>TradingView-style candles</span>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {CHART_RESOLUTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setResolution(option)}
            className={cn(
              "rounded px-2 py-1 text-[10px]",
              resolution === option
                ? "bg-[#00c076]/15 text-[#00c076]"
                : isLightMode ? "text-slate-600 hover:bg-[#eaf1f8] hover:text-slate-900" : "text-slate-500 hover:bg-[#1e293b] hover:text-slate-200",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );

  if (candles.length < 2) {
    return (
      <div data-testid="position-chart-empty" className={`overflow-hidden rounded-xl border shadow-[0_18px_45px_rgba(15,23,42,0.32)] ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0b0e14]"}`}>
        {chartControls}
        <div className={`grid h-[420px] place-items-center text-xs ${isLightMode ? "text-slate-600" : "text-slate-500"}`}>
          Loading candles for {position.symbol}…
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border shadow-[0_18px_45px_rgba(15,23,42,0.32)] ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0b0e14]"}`}>
      {chartControls}
      <div ref={chartRef} data-testid="position-chart" className="h-[420px] w-full" />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const isLightMode = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";

  return (
    <div className={`rounded-lg border p-1.5 sm:p-2.5 ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]"}`}>
      <p className={`text-[8px] uppercase tracking-wider sm:text-[10px] ${isLightMode ? "text-slate-600" : "text-slate-500"}`}>{label}</p>
      <p
        className={cn(
          "num mt-0.5 text-[10px] font-semibold sm:text-[13px]",
          tone === "up" ? "text-[#00c076]" : tone === "down" ? "text-[#ff455b]" : isLightMode ? "text-slate-900" : "text-slate-100",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PositionCard({ position }: { position: LivePosition }) {
  const isLightMode = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  const long = position.side === "buy";
  const pnl = position.pnl_inr ?? 0;
  const pending = position.state === "pending_order";

  return (
    <article
      data-testid="position-card"
      data-pair={position.pair}
      className={`flex flex-col gap-3 rounded-2xl border p-3 shadow-[0_18px_45px_rgba(15,23,42,0.24)] sm:gap-4 sm:p-4 ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#111724]"}`}
    >
      <header className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <span className={`num text-[12px] font-bold sm:text-[15px] ${isLightMode ? "text-slate-900" : "text-white"}`} data-testid="position-symbol">
          {position.symbol}
        </span>
        <span
          data-testid="position-side"
          className={cn(
            "num rounded px-1.5 py-0.5 text-[8px] font-bold sm:text-[10px]",
            long ? "bg-[#00c076]/12 text-[#00c076]" : "bg-[#ff455b]/12 text-[#ff455b]",
          )}
        >
          {long ? "LONG / BUY" : "SHORT / SELL"}
        </span>
        <span className={`num rounded px-1.5 py-0.5 text-[8px] sm:text-[10px] ${isLightMode ? "bg-[#eef3fb] text-slate-700" : "bg-[#1e293b] text-slate-300"}`}>
          {position.timeframe}
        </span>
        <span className={`num rounded px-1.5 py-0.5 text-[8px] sm:text-[10px] ${isLightMode ? "bg-[#eef3fb] text-slate-700" : "bg-[#1e293b] text-slate-300"}`}>
          {position.leverage}x
        </span>
        <span
          data-testid="position-state"
          className={cn(
            "num rounded px-1.5 py-0.5 text-[8px] font-semibold sm:text-[10px]",
            pending ? "bg-[#2e5cff]/15 text-[#7f9bff]" : "bg-[#00c076]/12 text-[#00c076]",
          )}
        >
          {pending ? `ORDER PENDING${position.order_deadline_ist ? ` · until ${position.order_deadline_ist}` : ""}` : "POSITION LIVE"}
        </span>
        <span className={`num ml-auto text-[8px] sm:text-[10px] ${isLightMode ? "text-slate-600" : "text-slate-500"}`}>
          {position.strategy_name} · {position.mode}
        </span>
      </header>

      <PositionChart position={position} />

      <div className="grid grid-cols-4 gap-1 sm:gap-2">
        <Stat label="Entry" value={fmtPrice(position.entry_price)} />
        <Stat label="Last" value={position.last_price ? fmtPrice(position.last_price) : "—"} />
        <Stat label="Take profit" value={fmtPrice(position.tp_price)} tone="up" />
        <Stat label="Stop loss" value={position.sl_price ? fmtPrice(position.sl_price) : "—"} tone="down" />
        <Stat
          label="P&L on margin"
          value={position.pnl_pct !== null ? `${position.pnl_pct.toFixed(2)}%` : "—"}
          tone={(position.pnl_pct ?? 0) >= 0 ? "up" : "down"}
        />
        <Stat label="P&L" value={fmtInr(pnl)} tone={pnl >= 0 ? "up" : "down"} />
        <Stat
          label="To TP"
          value={position.distance_to_tp_pct !== null ? `${position.distance_to_tp_pct.toFixed(2)}%` : "—"}
        />
        <Stat label="Capital" value={`₹${position.capital_inr.toLocaleString("en-IN")}`} />
      </div>

      <div className={`grid gap-2 rounded-xl border p-2 text-[9px] sm:grid-cols-3 sm:text-[10px] ${isLightMode ? "border-[#dfeaf3] bg-[#f7faff]" : "border-[#1e293b] bg-[#0d111a]"}`}>
        <IdField label="Exchange order ID" value={position.order_id} />
        <IdField label="Client correlation ID" value={position.client_order_id} />
        <IdField label="Exchange position ID" value={position.position_id} />
      </div>
    </article>
  );
}

function IdField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 break-all font-mono text-slate-300">{value || "Pending exchange confirmation"}</p>
    </div>
  );
}

export default function PositionMonitor() {
  const [tick, setTick] = useState(0);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const isLightMode = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  const { positions: streamedPositions } = useBotStream();

  const positions = useQuery({
    queryKey: ["bot-positions"],
    queryFn: () => apiGet<LivePosition[]>("/bot/positions"),
    refetchInterval: 5000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const list = streamedPositions ?? positions.data ?? EMPTY_POSITIONS;

  useEffect(() => {
    if (list.length === 0) {
      setSelectedPositionId(null);
      return;
    }
    if (!selectedPositionId || !list.some((position) => position.trade_id === selectedPositionId)) {
      setSelectedPositionId(list[0].trade_id || list[0].pair);
    }
  }, [list, selectedPositionId]);

  const selectedPosition = list.find(
    (position) => (position.trade_id || position.pair) === selectedPositionId,
  ) ?? list[0];

  return (
    <div className={`flex min-h-screen flex-col ${isLightMode ? "bg-[var(--background)] text-slate-900" : "bg-[#0b0e14] text-slate-100"}`}>
      <header className={`flex h-13 shrink-0 items-center gap-x-3 border-b px-4 py-2 backdrop-blur-sm ${isLightMode ? "border-[#dfeaf3] bg-white text-slate-900 shadow-sm" : "border-[#1d2d42] bg-[#0d1724] text-slate-100"}`}>
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border shadow-sm ${isLightMode ? "border-[#dfeaf3] bg-[#f8fbff] text-[#4b5563]" : "border-[#273244] bg-[#111827] text-slate-200"}`}>
              <Radar className="h-4 w-4" />
            </span>
            <div className="min-w-0 leading-tight">
              <h1 className={`font-heading text-[12px] font-bold tracking-tight ${isLightMode ? "text-slate-900" : "text-slate-100"}`}>Live Position</h1>
              <p className={`num hidden text-[9px] sm:block ${isLightMode ? "text-slate-600" : "text-slate-400"}`}>
                Entry · TP · SL monitor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {list.length > 0 ? (
              <span
                className="num inline-flex items-center gap-1 rounded-full border border-[#00c076]/30 bg-[#00c076]/10 px-1.5 py-0.5 text-[8px] text-[#00c076]"
                data-testid="live-position-indicator"
              >
                <span className="h-1.5 w-1.5 animate-[beacon_1.6s_ease-in-out_infinite] rounded-full bg-[#00c076]" />
                {list.length}
              </span>
            ) : null}
            <span className={`num hidden text-[10px] sm:inline ${isLightMode ? "text-slate-600" : "text-slate-400"}`} data-testid="monitor-heartbeat">
              tick {tick}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-3 p-3 lg:p-4">
        {list.length === 0 ? (
          <div
            data-testid="no-positions-state"
            className={`grid flex-1 place-items-center rounded-xl border border-dashed p-10 text-center ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]"}`}
          >
            <div>
              <p className={`font-heading text-sm font-semibold ${isLightMode ? "text-slate-900" : "text-slate-200"}`}>No live position right now</p>
              <p className={`mt-1 max-w-md text-xs leading-relaxed ${isLightMode ? "text-slate-600" : "text-slate-500"}`}>
                When a strategy places its limit order, this page shows the coin's candles with
                entry, take-profit and stop-loss lines, plus live P&amp;L — and keeps monitoring
                until the position closes.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`flex min-w-0 gap-1 overflow-x-auto rounded-lg border p-1.5 ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]"}`}
              role="tablist"
              aria-label="Live positions"
              data-testid="position-tabs"
            >
              {list.map((position, index) => {
                const positionId = position.trade_id || position.pair;
                const active = positionId === selectedPositionId;
                return (
                  <button
                    key={positionId}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-testid="position-tab"
                    onClick={() => setSelectedPositionId(positionId)}
                    className={cn(
                      "flex min-w-[150px] shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left transition-colors",
                      active
                        ? "border border-[#00c076]/40 bg-[#00c076]/[0.08]"
                        : isLightMode ? "border border-transparent hover:bg-[#edf3fa]" : "border border-transparent hover:bg-[#151e2d]",
                    )}
                  >
                    <span className="num text-[10px] text-[#7f9bff]">{index + 1}</span>
                    <span className="min-w-0">
                      <span className={`num block truncate text-[11px] font-semibold ${isLightMode ? "text-slate-900" : "text-slate-100"}`}>
                        {position.symbol}
                      </span>
                      <span className={cn(
                        "num block text-[9px] uppercase",
                        position.side === "buy" ? "text-[#00c076]" : "text-[#ff455b]",
                      )}>
                        {position.side === "buy" ? "LONG" : "SHORT"} · {position.timeframe}
                      </span>
                    </span>
                    <span className={`ml-auto num text-[10px] ${isLightMode ? "text-slate-700" : "text-slate-400"}`}>
                      {position.pnl_pct === null ? "—" : `${position.pnl_pct >= 0 ? "+" : ""}${position.pnl_pct.toFixed(2)}%`}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedPosition ? <PositionCard key={selectedPosition.trade_id || selectedPosition.pair} position={selectedPosition} /> : null}
          </>
        )}
      </main>

      <footer
        data-testid="scanning-footer"
        className={`num hidden h-9 shrink-0 items-center justify-between border-t px-4 text-[11px] md:flex ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)] text-slate-700" : "border-[#1e293b] bg-[#090c11] text-slate-400"}`}
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00c076] animate-[beacon_1.6s_ease-in-out_infinite]" />
          Live monitor
        </span>
        <span className={`${isLightMode ? "text-slate-600" : "text-slate-500"}`} data-testid="position-count">
          {list.length} open {list.length === 1 ? "position" : "positions"}
        </span>
      </footer>
    </div>
  );
}
