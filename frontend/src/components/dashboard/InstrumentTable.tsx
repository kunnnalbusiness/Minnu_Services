import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fmtCompact, fmtPct, fmtPrice } from "@/lib/types";
import type { Ticker } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "change_pct" | "last" | "max_leverage" | "volume" | "symbol" | "high" | "low";
type FilterKey = "all" | "leverage" | "gainers" | "losers";

const FILTERS: { key: FilterKey; label: string; testid: string }[] = [
  { key: "all", label: "All", testid: "filter-all-button" },
  { key: "leverage", label: "Leverage > 20x", testid: "filter-high-leverage-button" },
  { key: "gainers", label: "Gainers", testid: "filter-gainers-button" },
  { key: "losers", label: "Losers", testid: "filter-losers-button" },
];

const MAX_ROWS = 200;

function SortHead({
  label,
  sortKey,
  active,
  desc,
  align,
  testid,
  className,
  isLightMode,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  desc: boolean;
  align?: "right";
  testid: string;
  className?: string;
  isLightMode: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 select-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider",
        isLightMode ? "bg-[var(--background)] text-slate-600" : "bg-[#0e131f] text-slate-400",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      <button
        type="button"
        data-testid={testid}
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors duration-150",
          active ? "text-[#00c076]" : isLightMode ? "hover:text-slate-900" : "hover:text-slate-100",
        )}
      >
        {label}
        {active ? (
          desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
        ) : null}
      </button>
    </th>
  );
}

export default function InstrumentTable({ instruments }: { instruments: Ticker[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("change_pct");
  const [desc, setDesc] = useState(true);
  const prev = useRef<Map<string, number>>(new Map());
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const isLightMode = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";

  const showLeverageColumn = instruments.some((t) => (t.max_leverage ?? 0) > 0);
  const textPrimary = isLightMode ? "text-slate-900" : "text-slate-100";
  const textSecondary = isLightMode ? "text-slate-700" : "text-slate-300";
  const textMuted = isLightMode ? "text-slate-500" : "text-slate-400";

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = instruments.filter((t) => (q ? t.symbol.includes(q) || t.pair.includes(q) : true));
    if (filter === "leverage") list = list.filter((t) => (t.max_leverage ?? 0) > 20);
    if (filter === "gainers") list = list.filter((t) => t.change_pct > 0);
    if (filter === "losers") list = list.filter((t) => t.change_pct < 0);

    const dir = desc ? -1 : 1;
    return [...list]
      .sort((a, b) => {
        if (sortKey === "symbol") return dir * a.symbol.localeCompare(b.symbol);
        const av =
          sortKey === "max_leverage"
            ? (a.max_leverage ?? 0)
            : sortKey === "high"
              ? (a.high ?? 0)
              : sortKey === "low"
                ? (a.low ?? 0)
                : a[sortKey];
        const bv =
          sortKey === "max_leverage"
            ? (b.max_leverage ?? 0)
            : sortKey === "high"
              ? (b.high ?? 0)
              : sortKey === "low"
                ? (b.low ?? 0)
                : b[sortKey];
        return dir * (av - bv);
      })
      .slice(0, MAX_ROWS);
  }, [instruments, query, filter, sortKey, desc, isMobile]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(true);
    }
  };

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-lg border ${isMobile ? "max-h-[520px]" : ""} ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#0d111a]"}`}>
      <div className={`flex items-center gap-2 border-b px-2 py-1 md:px-2.5 md:py-1.5 md:py-2.5 ${isLightMode ? "border-[#dfeaf3]" : "border-[#1e293b]"}`}>
        <h2 className={`mr-auto min-w-0 shrink-0 font-heading text-[12px] font-semibold tracking-tight md:text-sm ${isLightMode ? "text-slate-900" : "text-slate-100"}`}>
          Active USDT Futures
        </h2>
        <div className="relative w-[160px] flex-none sm:w-[230px] md:flex-1 md:max-w-[320px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            data-testid="instrument-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by symbol"
            className={`h-7 w-full pl-8 pr-8 text-[10px] num md:h-8 md:text-[11px] ${isLightMode ? "border-[#dfeaf3] bg-[var(--background)] text-slate-800 placeholder:text-slate-500" : "border-[#1e293b] bg-[#0b0e14] text-slate-200 placeholder:text-slate-600"}`}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-slate-200"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div className={`flex gap-1 overflow-x-auto border-b px-2 py-1 md:px-2.5 md:py-1.5 ${isLightMode ? "border-[#dfeaf3]" : "border-[#1e293b]"}`}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={f.testid}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 rounded-md border px-2 py-[3px] text-[10px] font-medium leading-none transition-all duration-150 md:px-3 md:py-1.5 md:text-[11px]",
              filter === f.key
                ? isLightMode
                  ? "border-[#dfeaf3] bg-[var(--background)] text-slate-900"
                  : "border-[#334155] bg-[#1e293b] text-white"
                : isLightMode
                  ? "border-transparent bg-transparent text-slate-600 hover:border-[#dfeaf3] hover:text-slate-900"
                  : "border-transparent bg-transparent text-slate-400 hover:border-[#334155] hover:text-slate-200",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain" data-testid="instrument-table-scroll">
        <table className="w-full min-w-[520px] table-fixed border-collapse text-[10px] leading-none md:min-w-[980px] md:text-xs" role="table" aria-label="Active USDT Futures Instruments">
          <thead>
            <tr>
              <SortHead label={isMobile && showLeverageColumn ? "Instrument" : "Instrument"} sortKey="symbol" active={sortKey === "symbol"} desc={desc} testid="sort-symbol-button" isLightMode={isLightMode} onSort={onSort} />
              {showLeverageColumn ? (
                <SortHead label={isMobile ? "Lev" : "Max Lev."} sortKey="max_leverage" active={sortKey === "max_leverage"} desc={desc} align="right" testid="sort-leverage-button" className="hidden md:table-cell" isLightMode={isLightMode} onSort={onSort} />
              ) : null}
              <SortHead label="Last" sortKey="last" active={sortKey === "last"} desc={desc} align="right" testid="sort-price-button" isLightMode={isLightMode} onSort={onSort} />
              <SortHead label="24H %" sortKey="change_pct" active={sortKey === "change_pct"} desc={desc} align="right" testid="sort-change-button" isLightMode={isLightMode} onSort={onSort} />
              <SortHead label="24H H" sortKey="high" active={sortKey === "high"} desc={desc} align="right" testid="sort-high-button" isLightMode={isLightMode} onSort={onSort} />
              <SortHead label="24H L" sortKey="low" active={sortKey === "low"} desc={desc} align="right" testid="sort-low-button" isLightMode={isLightMode} onSort={onSort} />
              <SortHead label="Vol" sortKey="volume" active={sortKey === "volume"} desc={desc} align="right" testid="sort-volume-button" isLightMode={isLightMode} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const before = prev.current.get(t.pair);
              const tickUp = before !== undefined && t.last > before;
              const tickDown = before !== undefined && t.last < before;
              prev.current.set(t.pair, t.last);
              const up = t.change_pct >= 0;
              return (
                <tr
                  key={t.pair}
                  data-testid="instrument-row"
                  data-pair={t.pair}
                  className={cn(
                    "cursor-pointer border-b transition-colors duration-150",
                    isLightMode ? "border-[#edf3f9] hover:bg-[#eef3fb]" : "border-[#141c29] hover:bg-[#1e293b]",
                    (rows.indexOf(t) + 1) % 2 === 0 ? (isLightMode ? "bg-[#f4f8fd]" : "bg-[#0f172a]/20") : "bg-transparent",
                  )}
                >
                  <td className="px-1.5 py-1 md:px-3 md:py-1.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="min-w-0">
                        <span className={cn("num block text-[10px] font-semibold md:text-[12px]", textPrimary)}>{t.symbol}</span>
                      </div>
                    </div>
                  </td>
                  {showLeverageColumn ? (
                    <td className="hidden px-3 py-1.5 text-right md:table-cell">
                      <span className={cn("num rounded border px-1.5 py-0.5 text-[10px]", isLightMode ? "border-[#dfeaf3] bg-[#f5f9ff] text-slate-700" : "border-[#1e293b] bg-[#0b0e14] text-slate-300") }>
                        {t.max_leverage && t.max_leverage > 0 ? `${t.max_leverage}x` : "—"}
                      </span>
                    </td>
                  ) : null}
                  <td className="px-1.5 py-1 text-right md:px-3 md:py-1.5">
                    <span
                      key={`${t.pair}-${tickUp ? "u" : tickDown ? "d" : "f"}-${t.last}`}
                      className={cn(
                        "num inline-block rounded px-1 text-[10px] font-medium [font-feature-settings:'tnum'] md:text-[12px]",
                        textPrimary,
                        tickUp && "animate-[flash-up_0.6s_ease-out] text-[#00c076]",
                        tickDown && "animate-[flash-down_0.6s_ease-out] text-[#ff455b]",
                      )}
                    >
                      {fmtPrice(t.last)}
                    </span>
                  </td>
                  <td className="px-1.5 py-1 text-right md:px-3 md:py-1.5">
                    <span
                      data-testid="row-change"
                      className={cn(
                        "num inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold md:text-[12px]",
                        up ? "bg-[#00c076]/12 text-[#00c076]" : "bg-[#ff455b]/12 text-[#ff455b]",
                      )}
                    >
                      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {fmtPct(t.change_pct)}
                    </span>
                  </td>
                  <td className={cn("num px-1 py-1 text-right text-[9px] [font-feature-settings:'tnum'] md:px-2 md:text-[11px]", textSecondary)}>
                    {fmtPrice(t.high)}
                  </td>
                  <td className={cn("num px-1 py-1 text-right text-[9px] [font-feature-settings:'tnum'] md:px-2 md:text-[11px]", textSecondary)}>
                    {fmtPrice(t.low)}
                  </td>
                  <td className={cn("num px-1.5 py-1 text-right text-[10px] [font-feature-settings:'tnum'] md:px-3 md:py-1.5 md:text-[12px]", textMuted)}>{fmtCompact(t.volume)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-slate-500" data-testid="instrument-empty-state">
            {instruments.length === 0 ? "Waiting for the CoinDCX stream…" : "No instrument matches this filter."}
          </p>
        ) : null}
      </div>


    </div>
  );
}
