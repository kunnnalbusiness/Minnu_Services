import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, FlaskConical, History, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import { useBotStream } from "@/hooks/useBotStream";
import type { Strategy } from "@/lib/botTypes";
import { fmtPrice, fmtPct } from "@/lib/types";

type TestResult = {
  status: string;
  message?: string;
  target_time?: string;
  strategy?: string;
  pair?: string;
  side?: string;
  change_pct?: number;
  entry_price?: number;
  tp_price?: number;
  sl_price?: number | null;
  exit_price?: number | null;
  pnl_pct?: number;
  movers?: { pair: string; price: number; change_pct: number }[];
};

function strategyLabel(strategy: Strategy): string {
  return `${strategy.name} · ${strategy.timeframe}`;
}

export default function HistoricalTesting() {
  const { state } = useBotStream();
  const strategies = state?.strategies ?? [];
  const [strategyId, setStrategyId] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const test = useMutation({
    mutationFn: () => {
      if (!strategyId || !targetTime) throw new Error("Select a strategy, date, and time");
      return apiPost<TestResult>("/bot/historical-test", {
        strategy_id: strategyId,
        target_time: `${targetTime}:00+05:30`,
      });
    },
    onSuccess: setResult,
  });

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-[#c9ced4] bg-[#dfe3e7]/90 px-4 py-1.5 text-[#17202a]">
        <Link to="/position" className="text-slate-400 hover:text-white" aria-label="Back to live positions">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="grid h-7 w-7 place-items-center rounded bg-[#f5c451]/15 text-[#f5c451]"><FlaskConical className="h-4 w-4" /></span>
        <div>
          <h1 className="font-heading text-[12px] font-bold text-[#17202a]">Testing Old Data</h1>
          <p className="text-[9px] text-[#596273]">Paper simulation only · never saved to Trade History</p>
        </div>
        <Link to="/history" aria-label="Trade history" title="Trade history" className="ml-auto inline-flex h-7 w-7 items-center justify-center text-xs text-slate-400 hover:text-[#17202a]"><History className="h-3.5 w-3.5" /></Link>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-3 p-4 lg:grid-cols-[340px_1fr]">
        <section className="rounded-xl border border-[#1e293b] bg-[#111724] p-4">
          <h2 className="font-heading text-sm font-semibold">Run historical test</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Select the exact IST date and time. The scanner checks historical 24h movers, then applies the saved strategy rules.</p>
          <label className="mt-5 block text-[10px] uppercase tracking-wider text-slate-500" htmlFor="historical-time">Date &amp; time · IST</label>
          <input id="historical-time" type="datetime-local" value={targetTime} onChange={(event) => setTargetTime(event.target.value)} className="mt-1 w-full rounded border border-[#334155] bg-[#0b0e14] px-2 py-2 text-sm text-slate-200" />
          <label className="mt-4 block text-[10px] uppercase tracking-wider text-slate-500" htmlFor="historical-strategy">Strategy</label>
          <select id="historical-strategy" value={strategyId} onChange={(event) => setStrategyId(event.target.value)} className="mt-1 w-full rounded border border-[#334155] bg-[#0b0e14] px-2 py-2 text-sm text-slate-200">
            <option value="">Select strategy</option>
            {strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategyLabel(strategy)}</option>)}
          </select>
          <Button className="mt-5 w-full" disabled={test.isPending || !strategyId || !targetTime} onClick={() => test.mutate()}>
            <Play className="mr-1.5 h-3.5 w-3.5" /> {test.isPending ? "Fetching historical data..." : "Execute test"}
          </Button>
          {test.error ? <p className="mt-3 text-xs text-[#ff455b]">{(test.error as Error).message}</p> : null}
        </section>

        <section className="min-w-0 rounded-xl border border-[#1e293b] bg-[#111724] p-4">
          {!result ? <div className="grid min-h-[360px] place-items-center text-center text-xs text-slate-500">Choose a date, time, and strategy to see the simulated result here.</div> : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1e293b] pb-3">
                <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Result</p><h2 className="font-heading mt-1 text-lg font-bold text-white">{result.status.replaceAll("_", " ")}</h2><p className="text-xs text-slate-500">{result.strategy} · {result.target_time}</p></div>
                {result.pnl_pct !== undefined ? <div className={result.pnl_pct >= 0 ? "num text-right text-xl font-bold text-[#00c076]" : "num text-right text-xl font-bold text-[#ff455b]"}>{fmtPct(result.pnl_pct)}<p className="text-[10px] font-normal text-slate-500">simulated P&amp;L</p></div> : null}
              </div>
              {result.pair ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div><p className="text-[10px] text-slate-500">Pair / side</p><p className="num text-sm text-white">{result.pair} · {result.side?.toUpperCase()}</p></div><div><p className="text-[10px] text-slate-500">Entry</p><p className="num text-sm text-white">{fmtPrice(result.entry_price ?? 0)}</p></div><div><p className="text-[10px] text-slate-500">TP / SL</p><p className="num text-sm text-white">{fmtPrice(result.tp_price ?? 0)} / {result.sl_price ? fmtPrice(result.sl_price) : "—"}</p></div><div><p className="text-[10px] text-slate-500">Exit</p><p className="num text-sm text-white">{result.exit_price ? fmtPrice(result.exit_price) : "Open"}</p></div></div> : <p className="mt-5 text-sm text-amber-300">{result.message}</p>}
              {result.movers?.length ? <div className="mt-6"><h3 className="font-heading text-xs font-semibold text-slate-200">Historical 24h movers checked</h3><div className="mt-2 divide-y divide-[#1e293b] rounded border border-[#1e293b]">{result.movers.map((mover, index) => <div key={mover.pair} className="flex items-center gap-3 px-3 py-2 text-xs"><span className="num w-5 text-slate-500">{index + 1}</span><span className="num flex-1 text-slate-200">{mover.pair}</span><span className="num text-slate-400">{fmtPrice(mover.price)}</span><span className={mover.change_pct >= 0 ? "num text-[#00c076]" : "num text-[#ff455b]"}>{fmtPct(mover.change_pct)}</span></div>)}</div></div> : null}
            </>
          )}
        </section>
      </main>
    </div>
  );
}