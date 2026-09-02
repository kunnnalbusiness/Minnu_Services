import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CandlestickSeries, ColorType, HistogramSeries, LineStyle, createChart } from "lightweight-charts";
import type { UTCTimestamp } from "lightweight-charts";
import { apiGet } from "@/lib/api";
import { fmtInr, TRADE_STATUS_LABEL } from "@/lib/botTypes";
import type { LivePosition, Trade } from "@/lib/botTypes";
import type { CandleSeries } from "@/lib/types";
import { fmtPrice } from "@/lib/types";
import { cn } from "@/lib/utils";

type PositionRecord = Trade | LivePosition;
const CHART_RESOLUTIONS = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"] as const;

function isLivePosition(record: PositionRecord): record is LivePosition {
  return "last_price" in record;
}

function formatDateTime(value: string | null): string {
  if (!value) return "Running";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDateOnly(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimeOnly(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function duration(record: PositionRecord): string {
  const closedAt = isLivePosition(record) ? null : record.closed_at;
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((end - new Date(record.opened_at).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
}

function chartTime(value: number): UTCTimestamp {
  const seconds = Math.abs(value) >= 1_000_000_000_000 ? value / 1000 : value;
  return Math.floor(seconds) as UTCTimestamp;
}

export function PositionChart({ record }: { record: PositionRecord }) {
  const [resolution, setResolution] = useState<string>("1m");
  const chartRef = useRef<HTMLDivElement | null>(null);
  const isFirstRenderRef = useRef(true);
  const candles = useQuery({
    queryKey: ["trade-position-candles", record.pair, resolution],
    queryFn: () => apiGet<CandleSeries>(`/market/candles/${record.pair}?resolution=${resolution}&limit=60`),
    refetchInterval: isLivePosition(record) ? 10_000 : false,
    retry: false,
    placeholderData: (previous) => previous,
  });
  const rows = candles.data?.candles ?? [];
  const livePrice = isLivePosition(record) ? record.last_price : record.exit_price;
  const levels = [record.entry_price, record.tp_price, record.sl_price, livePrice].filter(
    (value): value is number => typeof value === "number" && value > 0,
  );

  useEffect(() => {
    const container = chartRef.current;
    if (!container || rows.length < 2 || levels.length === 0) return;

    // Use fixed width from parent to prevent zoom affecting layout
    const fixedWidth = container.parentElement?.clientWidth ?? 600;
    const chart = createChart(container, {
      width: fixedWidth,
      height: 320,
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
      handleScroll: { mouseWheel: !isLivePosition(record), pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: !isLivePosition(record), pinch: true },
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
      rows
        .map((row) => ({
          time: chartTime(row.time),
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
        }))
        .sort((left, right) => left.time - right.time),
    );

    // Draw vertical line at entry time using chart coordinate conversion
    const entryTime = chartTime(new Date(record.opened_at).getTime() / 1000);
    const entryCoord = chart.timeScale().timeToCoordinate(entryTime);

    if (entryCoord !== null) {
      // Create SVG overlay for vertical entry line
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("style", "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;");
      svg.setAttribute("viewBox", `0 0 ${container.clientWidth} 320`);
      svg.setAttribute("width", String(container.clientWidth));
      svg.setAttribute("height", "320");

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      const lineX = (entryCoord / container.clientWidth) * container.clientWidth;
      line.setAttribute("x1", String(lineX));
      line.setAttribute("y1", "0");
      line.setAttribute("x2", String(lineX));
      line.setAttribute("y2", "320");
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
      scaleMargins: { top: 0.75, bottom: 0 },
      visible: false,
    });
    volumeSeries.setData(
      rows
        .map((row) => ({
          time: chartTime(row.time),
          value: row.volume,
          color: row.close >= row.open ? "#00c07655" : "#ff455b55",
        }))
        .sort((left, right) => left.time - right.time),
    );

    [
      { value: record.tp_price, color: "#00c076", title: "TP" },
      ...(record.sl_price ? [{ value: record.sl_price, color: "#ff455b", title: "SL" }] : []),
      ...(livePrice ? [{ value: livePrice, color: "#f5c451", title: isLivePosition(record) ? "LIVE" : "EXIT" }] : []),
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

    // Prevent chart zoom from affecting page layout - no ResizeObserver needed
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      chart.remove();
    };
  }, [rows, record.entry_price, record.tp_price, record.sl_price, livePrice]);

  if (rows.length < 2 || levels.length === 0) {
    return <div className="grid h-[210px] place-items-center rounded-xl border border-dashed border-[#1e293b] bg-[#0b0e14] text-xs text-slate-500 sm:h-[320px]">Loading price chart…</div>;
  }

  return (
    <div className="relative z-10 w-full max-w-full overflow-hidden rounded-xl border border-[#1e293b] bg-[#0b0e14] shadow-[0_10px_30px_rgba(15,23,42,0.18)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e293b] bg-[#0d111a] px-3 py-2">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Price chart · IST+5:30</span>
          <span className="num ml-3 text-[10px] text-slate-500">TradingView-style candles</span>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {CHART_RESOLUTIONS.map((option) => (
            <button key={option} type="button" onClick={() => setResolution(option)} className={cn("rounded px-2 py-1 text-[10px]", resolution === option ? "bg-[#00c076]/15 text-[#00c076]" : "text-slate-500 hover:bg-[#1e293b] hover:text-slate-200")}>
              {option}
            </button>
          ))}
        </div>
      </div>
      <div ref={chartRef} className="relative z-10 h-[210px] w-full overflow-hidden sm:h-[320px]" style={{ touchAction: "none" }} />
    </div>
  );
}

export default function TradePositionCard({
  record,
  expanded,
  onToggle,
  showChevron = true,
}: {
  record: PositionRecord;
  expanded: boolean;
  onToggle: () => void;
  showChevron?: boolean;
}) {
  const live = isLivePosition(record);
  const isLightMode = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  const showDetails = expanded;
  const status = TRADE_STATUS_LABEL[live ? (record.state === "pending_order" ? "pending" : "open") : record.status] ?? {
    label: live ? "Running" : record.status,
    className: "text-slate-300",
  };
  const currentPrice = live ? record.last_price : record.exit_price;
  const pnl = record.pnl_inr ?? 0;
  const closedAt = live ? null : record.closed_at;
  const metadata = [
    { label: "Date", value: formatDateOnly(record.opened_at) },
    { label: "Opened", value: formatTimeOnly(record.opened_at) },
    { label: live ? "Updated" : "Closed", value: live ? formatTimeOnly(new Date().toISOString()) : formatTimeOnly(closedAt) },
    { label: "Duration", value: duration(record) },
  ];

  return (
    <article className={cn("relative z-0 w-full max-w-full min-w-0 overflow-hidden rounded-xl border shadow-[0_14px_35px_rgba(15,23,42,0.18)] transition-all duration-200 hover:border-[#334155]", isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#111724]") }>
      {live ? (
        <button type="button" onClick={onToggle} aria-expanded={expanded} className={cn("block w-full text-left", isLightMode ? "hover:bg-[#eef3fb]" : "hover:bg-[#151e2b]")}>
          <div className="grid grid-cols-2 gap-2 px-2.5 py-2 sm:grid-cols-6 sm:items-center">
            <div className="min-w-0">
              <p className="num truncate text-sm font-bold text-white">{record.pair.replace("B-", "")}</p>
              <p className="truncate text-[10px] text-slate-500">{record.strategy_name} · {record.timeframe}</p>
            </div>
            <div className={cn("num text-[11px] font-bold uppercase", record.side === "buy" ? "text-[#00c076]" : "text-[#ff455b]")}>{record.side === "buy" ? "LONG / BUY" : "SHORT / SELL"}</div>
            <div><p className="text-[10px] uppercase text-slate-600">Entry</p><p className="num text-xs text-slate-200">{fmtPrice(record.entry_price)}</p></div>
            <div><p className="text-[10px] uppercase text-slate-600">Live</p><p className="num text-xs text-slate-200">{currentPrice ? fmtPrice(currentPrice) : "—"}</p></div>
            <div className={cn("num text-xs font-semibold", pnl > 0 ? "text-[#00c076]" : pnl < 0 ? "text-[#ff455b]" : "text-slate-400")}>{record.pnl_inr === null ? "P&L —" : fmtInr(pnl)}</div>
            <div className="flex items-center justify-end gap-2"><span className={cn("num text-[10px] font-semibold", status.className)}>{status.label}</span>{showChevron ? <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", expanded && "rotate-180")} /> : null}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-[#1e293b] px-2.5 py-2 text-[10px] sm:grid-cols-4">
            {metadata.map((item) => (
              <div key={item.label} className="min-w-0">
                <span className="block uppercase text-slate-600">{item.label}</span>
                <span className="num mt-0.5 block text-slate-300">{item.value}</span>
              </div>
            ))}
          </div>
        </button>
      ) : (
        <button type="button" onClick={onToggle} aria-expanded={expanded} className={cn("block w-full text-left", isLightMode ? "hover:bg-[#eef3fb]" : "hover:bg-[#151e2b]")}>
        <div className="grid grid-cols-2 gap-2 px-2.5 py-2 sm:grid-cols-6 sm:items-center">
          <div className="min-w-0">
            <p className="num truncate text-sm font-bold text-white">{record.pair.replace("B-", "")}</p>
            <p className="truncate text-[10px] text-slate-500">{record.strategy_name} · {record.timeframe}</p>
          </div>
          <div className={cn("num text-[11px] font-bold uppercase", record.side === "buy" ? "text-[#00c076]" : "text-[#ff455b]")}>{record.side === "buy" ? "LONG / BUY" : "SHORT / SELL"}</div>
          <div><p className="text-[10px] uppercase text-slate-600">Entry</p><p className="num text-xs text-slate-200">{fmtPrice(record.entry_price)}</p></div>
          <div><p className="text-[10px] uppercase text-slate-600">{live ? "Live" : "Exit"}</p><p className="num text-xs text-slate-200">{currentPrice ? fmtPrice(currentPrice) : "—"}</p></div>
          <div className={cn("num text-xs font-semibold", pnl > 0 ? "text-[#00c076]" : pnl < 0 ? "text-[#ff455b]" : "text-slate-400")}>{live && record.pnl_inr === null ? "P&L —" : fmtInr(pnl)}</div>
          <div className="flex items-center justify-between gap-2"><span className={cn("num text-[10px] font-semibold", status.className)}>{status.label}</span>{showChevron ? <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", expanded && "rotate-180")} /> : null}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-[#1e293b] px-2.5 py-2 text-[10px] sm:grid-cols-4">
          {metadata.map((item) => (
            <div key={item.label} className="min-w-0">
              <span className="block uppercase text-slate-600">{item.label}</span>
              <span className="num mt-0.5 block text-slate-300">{item.value}</span>
            </div>
          ))}
        </div>
        </button>
      )}
      {showDetails ? (
        <div className={cn("relative z-10 flex flex-col gap-3 overflow-hidden border-t p-2.5", isLightMode ? "border-[#dfeaf3] bg-[#f7faff]" : "border-[#1e293b] bg-[#0f1621]")}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] sm:grid-cols-4">
            <div className="min-w-0"><span className="block uppercase text-slate-600">Quantity</span><span className="num text-slate-300">{record.quantity}</span></div>
            <div className="min-w-0"><span className="block uppercase text-slate-600">Capital / Leverage</span><span className="num text-slate-300">₹{record.capital_inr.toLocaleString("en-IN")} / {record.leverage}x</span></div>
            <div className="min-w-0"><span className="block uppercase text-slate-600">TP / SL</span><span className="num text-slate-300">{fmtPrice(record.tp_price)} / {record.sl_price ? fmtPrice(record.sl_price) : "—"}</span></div>
            <div className="min-w-0"><span className="block uppercase text-slate-600">P&L</span><span className={cn("num", pnl >= 0 ? "text-[#00c076]" : "text-[#ff455b]")}>{record.pnl_pct === null ? "—" : `${record.pnl_pct.toFixed(2)}%`} · {live && record.pnl_inr === null ? "—" : fmtInr(pnl)}</span></div>
            <div className="min-w-0"><span className="block uppercase text-slate-600">Opened</span><span className="num text-slate-300">{formatDateTime(record.opened_at)}</span></div>
            <div className="min-w-0"><span className="block uppercase text-slate-600">Closed</span><span className="num text-slate-300">{formatDateTime(closedAt)}</span></div>
            <div className="min-w-0"><span className="block uppercase text-slate-600">Duration</span><span className="num text-slate-300">{duration(record)}</span></div>
            <div className="min-w-0"><span className="block uppercase text-slate-600">Mode</span><span className="num text-slate-300">{record.mode}</span></div>
            <div className="min-w-0"><span className="block uppercase text-slate-600">Order ID</span><span className="num break-all text-slate-300">{record.order_id || "—"}</span></div>
            <div className="min-w-0"><span className="block uppercase text-slate-600">Position ID</span><span className="num break-all text-slate-300">{record.position_id || "pending"}</span></div>
            <div className="min-w-0"><span className="block uppercase text-slate-600">Client ref</span><span className="num break-all text-slate-300">{record.client_order_id || "—"}</span></div>
          </div>
          <PositionChart record={record} />
        </div>
      ) : null}
    </article>
  );
}
