import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, FileJson, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

type AuditRecord = {
  owner_id: string;
  method: string;
  path: string;
  request_json: unknown;
  response_json: unknown;
  status_code: number | null;
  error: string | null;
  created_at: number;
};

function pretty(value: unknown): string {
  if (value === null || value === undefined) return "No data";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function timeLabel(value: number): string {
  return new Date(value * 1000).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function AuditCard({ record }: { record: AuditRecord }) {
  const [open, setOpen] = useState(false);
  const failed = Boolean(record.error) || (record.status_code !== null && record.status_code >= 400);
  return (
    <article className="overflow-hidden rounded-xl border border-[#1e293b] bg-[#111724] shadow-[0_12px_30px_rgba(2,8,20,0.18)]">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#172033] sm:px-4">
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", failed ? "bg-[#ff455b]/15 text-[#ff455b]" : "bg-[#00c076]/15 text-[#00c076]")}>
          {failed ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <strong className={cn("rounded px-1.5 py-0.5 text-[10px]", record.method === "POST" ? "bg-[#f5c451]/15 text-[#f5c451]" : "bg-[#7f9bff]/15 text-[#9eb1ff]")}>{record.method}</strong>
            <span className="truncate font-mono text-xs text-slate-200">{record.path}</span>
          </span>
          <span className="mt-1 block text-[10px] text-slate-500">{timeLabel(record.created_at)}</span>
        </span>
        <span className={cn("hidden rounded-full px-2 py-1 text-[10px] font-semibold sm:inline-flex", failed ? "bg-[#ff455b]/10 text-[#ff455b]" : "bg-[#00c076]/10 text-[#00c076]")}>{record.status_code ?? "NETWORK ERROR"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-[#1e293b] p-3 sm:grid-cols-3 sm:p-4">
          <JsonBlock title="Request JSON" value={record.request_json} />
          <JsonBlock title="Response JSON" value={record.response_json} />
          <JsonBlock title="Error / missing detail" value={record.error ?? "No error"} error={failed} />
        </div>
      ) : null}
    </article>
  );
}

function JsonBlock({ title, value, error = false }: { title: string; value: unknown; error?: boolean }) {
  return (
    <section className="min-w-0">
      <h2 className={cn("mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider", error ? "text-[#ff455b]" : "text-slate-400")}>
        <FileJson className="h-3 w-3" /> {title}
      </h2>
      <pre className={cn("max-h-72 min-h-24 overflow-auto rounded-lg border p-3 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-words", error ? "border-[#ff455b]/20 bg-[#2a1118] text-[#ff9aa5]" : "border-[#263247] bg-[#0b0e14] text-slate-300")}>{pretty(value)}</pre>
    </section>
  );
}

export default function RealMoneyTrade() {
  const audit = useQuery({
    queryKey: ["trade-api-audit"],
    queryFn: () => apiGet<AuditRecord[]>("/bot/trade-api-audit?limit=200"),
    refetchInterval: 10_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const records = audit.data ?? [];
  const failed = records.filter((record) => Boolean(record.error) || (record.status_code !== null && record.status_code >= 400)).length;
  const success = records.length - failed;

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100">
      <header className="border-b border-[#1d2d42] bg-[#0d1724] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f5c451]/15 text-[#f5c451]"><FileJson className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.18em] text-[#f5c451]">Operations</p><h1 className="font-heading text-lg font-semibold text-white sm:text-xl">Real Money Trade Response</h1><p className="mt-1 text-xs text-slate-400">CoinDCX request, response, and failure audit trail</p></div>
          </div>
          <button type="button" onClick={() => void audit.refetch()} disabled={audit.isFetching} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#334155] bg-[#111827] px-3 text-xs text-slate-200 hover:bg-[#172033] disabled:opacity-50" title="Refresh audit log"><RefreshCw className={cn("h-3.5 w-3.5", audit.isFetching && "animate-spin")} /><span className="hidden sm:inline">Refresh</span></button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat icon={<FileJson />} label="Total calls" value={records.length} />
          <Stat icon={<CheckCircle2 />} label="Successful" value={success} tone="good" />
          <Stat icon={<AlertTriangle />} label="Errors" value={failed} tone="bad" />
          <Stat icon={<ShieldCheck />} label="Storage" value="MongoDB" />
        </div>
        <div className="rounded-xl border border-[#f5c451]/25 bg-[#211d10] p-3 text-xs leading-relaxed text-[#f7d98a] sm:p-4"><strong>Audit safety:</strong> request bodies are stored for debugging, but API keys, secrets, auth headers, and signatures are never stored. This page is read-only and does not place a trade.</div>
        {audit.error ? <div className="rounded-xl border border-[#ff455b]/30 bg-[#2a1118] p-4 text-sm text-[#ff9aa5]">Unable to load MongoDB trade audit: {(audit.error as Error).message}</div> : null}
        {!audit.error && records.length === 0 ? <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-[#334155] bg-[#0d111a] p-6 text-center text-sm text-slate-500">No signed CoinDCX requests recorded yet. Live wallet validation, order placement, status checks, and exits will appear here.</div> : null}
        <div className="space-y-2">{records.map((record, index) => <AuditCard key={`${record.created_at}-${record.path}-${index}`} record={record} />)}</div>
      </main>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone?: "good" | "bad" }) {
  return <div className="rounded-xl border border-[#1e293b] bg-[#111724] p-3"><div className={cn("mb-2 h-4 w-4", tone === "good" ? "text-[#00c076]" : tone === "bad" ? "text-[#ff455b]" : "text-[#f5c451]")}>{icon}</div><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-mono text-sm font-semibold text-slate-100">{value}</p></div>;
}
