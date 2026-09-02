import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, FileJson, History, LineChart, Power, Radio, Radar, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import AddStrategyDialog from "@/components/bot/AddStrategyDialog";
import ApiKeysDialog from "@/components/bot/ApiKeysDialog";
import LogConsole from "@/components/bot/LogConsole";
import StrategyList from "@/components/bot/StrategyList";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiDelete, apiPost, apiPut } from "@/lib/api";
import type { Strategy, StrategyCreate } from "@/lib/botTypes";
import { useBotStream } from "@/hooks/useBotStream";
import { cn } from "@/lib/utils";

export default function BotControl() {
  const { state, logs, connection } = useBotStream();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (state?.credentials_configured) {
      setNoticeDismissed(false);
      localStorage.setItem("bot-api-notice-dismissed", "false");
      return;
    }

    const dismissed = localStorage.getItem("bot-api-notice-dismissed") === "true";
    setNoticeDismissed(dismissed);
  }, [state?.credentials_configured]);

  useEffect(() => {
    if (!state || state.credentials_configured) return;
    localStorage.setItem("bot-api-notice-dismissed", String(noticeDismissed));
  }, [noticeDismissed, state?.credentials_configured]);

  const strategies = state?.strategies ?? [];
  const selected = strategies.find((s) => s.id === selectedId) ?? null;
  const botOn = state?.bot_on ?? false;
  const live = state?.execution_mode === "LIVE";
  const isLightMode = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bot-state"] });

  const toggleBot = useMutation({
    mutationFn: (on: boolean) => apiPost("/bot/toggle", { on }),
    onSuccess: (_d, on) => {
      toast.success(on ? "Bot switched ON" : "Bot switched OFF");
      refresh();
    },
    onError: () => toast.error("Could not switch the bot"),
  });

  const create = useMutation({
    mutationFn: (body: StrategyCreate) => apiPost<Strategy>("/bot/strategies", body),
    onSuccess: (s) => {
      setSelectedId(s.id);
      toast.success(`Strategy “${s.name}” created`);
      refresh();
    },
    onError: () => toast.error("Could not create the strategy"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/bot/strategies/${id}`),
    onSuccess: () => {
      setSelectedId(null);
      toast.success("Strategy deleted");
      refresh();
    },
    onError: () => toast.error("Could not delete the strategy"),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: StrategyCreate }) => apiPut<Strategy>(`/bot/strategies/${id}`, body),
    onSuccess: (s) => {
      setEditingStrategy(null);
      toast.success(`Strategy “${s.name}” updated`);
      refresh();
    },
    onError: () => toast.error("Could not update the strategy"),
  });

  const setEnabled = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      apiPost<Strategy>(`/bot/strategies/${id}/enabled`, { on }),
    onSuccess: (s) => {
      toast.success(`${s.name} ${s.enabled ? "armed" : "disabled"}`);
      refresh();
    },
    onError: () => toast.error("Could not change the strategy"),
  });



  return (
    <div className={`terminal-shell flex h-[calc(100dvh-4.5rem)] min-h-0 flex-col lg:h-screen lg:overflow-hidden ${isLightMode ? "bg-[var(--background)] text-slate-900" : "bg-[#0b0e14] text-slate-100"}`}>
      <header className={`flex h-13 shrink-0 items-center gap-x-3 border-b px-4 py-2 backdrop-blur-sm ${isLightMode ? "border-[#dfeaf3] bg-white text-slate-900 shadow-sm" : "border-[#1d2d42] bg-[#0d1724] text-slate-100"}`}>
        <div className="hidden md:flex md:w-full md:items-center md:gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded bg-[#00c076]/15 text-[#00c076]">
              <Bot className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <h1 className="font-heading text-[12px] font-bold tracking-tight text-[#17202a]">
                Bot Control Center
              </h1>
              <p className="num text-[9px] text-[#596273]" data-testid="bot-window-label">
                {state?.trading_window ?? "05:30 → 03:40 IST · slots follow each strategy's timeframe"}
                {state ? ` · ${state.server_time_ist.slice(11, 19)} IST` : ""}
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span
              data-testid="execution-mode-badge"
              className={cn(
                "num inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                live
                  ? "border-[#ff455b]/40 bg-[#ff455b]/10 text-[#ff455b]"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-400",
              )}
            >
              {live ? <AlertTriangle className="h-3 w-3" /> : null}
              {live ? "LIVE ORDERS" : "PAPER MODE"}
            </span>
            <span
              data-testid="bot-connection-badge"
              className={cn(
                "num inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px]",
                connection === "live"
                  ? "border-[#00c076]/40 bg-[#00c076]/10 text-[#00c076]"
                  : "border-[#ff455b]/40 bg-[#ff455b]/10 text-[#ff455b]",
              )}
            >
              <Radio className="h-3 w-3" />
              {connection === "live" ? "Stream" : "Stream offline"}
            </span>

            <Button
              size="sm"
              data-testid="bot-power-button"
              variant={botOn ? "destructive" : "default"}
              disabled={toggleBot.isPending}
              onClick={() => toggleBot.mutate(!botOn)}
              aria-label={botOn ? "Turn bot off" : "Turn bot on"}
              title={botOn ? "Turn bot off" : "Turn bot on"}
              className="h-7 w-7 p-0"
            >
              <Power className="h-3.5 w-3.5" />
              <span className="sr-only">{botOn ? "Turn bot off" : "Turn bot on"}</span>
            </Button>

            <AddStrategyDialog onCreate={(body) => create.mutate(body)} pending={create.isPending} />
            <AddStrategyDialog
              onCreate={() => undefined}
              editingStrategy={editingStrategy}
              onUpdate={(id, body) => update.mutate({ id, body })}
              open={Boolean(editingStrategy)}
              onOpenChange={(open) => { if (!open) setEditingStrategy(null); }}
              showTrigger={false}
              pending={update.isPending}
            />

            <Button
              size="sm"
              variant="outline"
              data-testid="delete-strategy-button"
              disabled={!selected || remove.isPending}
              onClick={() => selected && remove.mutate(selected.id)}
              className="h-7 w-7 p-0"
              aria-label="Delete strategy"
              title="Delete strategy"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Delete strategy</span>
            </Button>

            <ApiKeysDialog />

            <Link
              to="/position"
              data-testid="position-link"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-slate-200")}
              aria-label="Live position"
              title="Live position"
            >
              <Radar className="h-3.5 w-3.5" />
            </Link>

            <Link
              to="/history"
              data-testid="history-link"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-slate-200")}
              aria-label="Trade history"
              title="Trade history"
            >
              <History className="h-3.5 w-3.5" />
            </Link>

            <Link
              to="/realmoneytrade"
              data-testid="real-money-trade-link"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-slate-200")}
              aria-label="Real money trade response"
              title="Real money trade response"
            >
              <FileJson className="h-3.5 w-3.5" />
            </Link>

            <Link
              to="/"
              data-testid="scanner-link"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-slate-300")}
              aria-label="Scanner dashboard"
              title="Scanner dashboard"
            >
              <LineChart className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className={`flex w-full items-center justify-between gap-3 md:hidden ${isLightMode ? "text-slate-900" : "text-slate-100"}`}>
          <div className="flex min-w-0 items-center gap-2">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border shadow-sm ${isLightMode ? "border-[#dfeaf3] bg-[#f8fbff] text-[#4b5563]" : "border-[#bfc6ce] bg-[#edf1f4] text-[#4b5563]"}`}>
              <Bot className="h-4 w-4" />
            </span>
            <div className="min-w-0 leading-tight">
              <h1 className="font-heading text-[12px] font-bold tracking-tight text-[#17202a]">
                Bot Control
              </h1>
            </div>
          </div>

          <span
            data-testid="bot-connection-badge"
            className={cn(
              "num inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-medium",
              connection === "live"
                ? "border-[#00c076]/40 bg-[#00c076]/10 text-[#00c076]"
                : connection === "connecting"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                  : "border-[#ff455b]/40 bg-[#ff455b]/10 text-[#ff455b]",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connection === "live"
                  ? "bg-[#00c076] animate-[beacon_1.6s_ease-in-out_infinite]"
                  : connection === "connecting"
                    ? "bg-amber-400"
                    : "bg-[#ff455b]",
              )}
            />
            {connection === "live" ? "Live · CoinDCX" : connection === "connecting" ? "Connecting…" : "Stream offline · retrying"}
          </span>
        </div>
      </header>

      <div className={`grid min-h-[52px] grid-cols-4 items-center gap-2 border-b px-2 py-2 md:hidden ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)]" : "border-[#1e293b] bg-[#111827]/80"}`}>
        <button
          type="button"
          onClick={() => toggleBot.mutate(!botOn)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[9px] font-medium",
            botOn
              ? "border-[#00c076]/40 bg-[#00c076]/10 text-[#00c076]"
              : isLightMode
                ? "border-[#dfeaf3] bg-[var(--background)] text-slate-700"
                : "border-slate-500/40 bg-slate-500/10 text-slate-300",
          )}
          aria-label={botOn ? "Turn bot off" : "Turn bot on"}
        >
          <Power className="h-3 w-3" />
          {botOn ? "Bot On" : "Bot Off"}
        </button>

        <div
          className={cn(
            "rounded-md border px-2 py-1.5 text-center text-[9px] font-semibold",
            live
              ? "border-[#00c076]/40 bg-[#00c076]/10 text-[#00c076]"
              : "border-amber-500/40 bg-amber-500/10 text-amber-400",
          )}
        >
          {live ? "Money Mode" : "Paper Mode"}
        </div>

        <button
          type="button"
          className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[9px] font-medium ${isLightMode ? "border-[#dfeaf3] bg-[var(--background)] text-slate-700" : "border-[#1e293b] bg-[#0b0e14] text-slate-200"}`}
          onClick={() => {
            const addButton = document.querySelector(
              '[data-testid="add-strategy-trigger"], [data-testid="add-strategy-button"]',
            ) as HTMLButtonElement | null;
            addButton?.click();
          }}
        >
          <Bot className="h-3 w-3" />
          Add Strategy
        </button>

        <ApiKeysDialog compact />
      </div>

      {!noticeDismissed ? (
        <div
          data-testid="paper-mode-notice"
          className={cn(
            "flex shrink-0 items-center gap-3 border-b px-4 py-1 text-[11px] md:py-1.5",
            state?.credentials_configured
              ? "border-[#00c076]/20 bg-[#00c076]/[0.06] text-[#6ee7b7]"
              : isLightMode
                ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-700"
                : "border-amber-500/20 bg-amber-500/[0.06] text-amber-300",
          )}
        >
          <span className="min-w-0 flex-1">
            {state?.credentials_configured ? (
              <>CoinDCX API keys configured — PAPER mode is active. Enable live trading from the <b>API Keys</b> button when ready.</>
            ) : (
              <>No CoinDCX API keys configured — every entry and exit is simulated (PAPER). Use the <b>API Keys</b> button to add your key and secret.</>
            )}
          </span>
          <button
            type="button"
            aria-label="Dismiss API key notice"
            data-testid="dismiss-paper-mode-notice"
            onClick={() => setNoticeDismissed(true)}
            className="shrink-0 rounded p-1 text-current/70 transition-colors hover:bg-black/10 hover:text-current"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 lg:h-full lg:grid-cols-12 lg:gap-3 lg:overflow-hidden lg:p-3">
        <section className="terminal-panel min-h-0 lg:col-span-4 lg:h-full">
          <StrategyList
            strategies={strategies}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onToggleEnabled={(s) => setEnabled.mutate({ id: s.id, on: !s.enabled })}
            onEdit={setEditingStrategy}
          />
        </section>
        <section className="terminal-panel min-h-0 lg:col-span-8 lg:h-full">
          <LogConsole logs={logs} strategies={strategies} />
        </section>
      </main>

      <footer
        data-testid="scanning-footer"
        className={`num hidden h-9 shrink-0 items-center justify-between border-t px-4 text-[11px] md:flex ${isLightMode ? "border-[#dfeaf3] bg-[var(--card)] text-slate-600" : "border-[#1e293b] bg-[#090c11] text-slate-400"}`}
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00c076] animate-[beacon_1.6s_ease-in-out_infinite]" />
          {botOn ? "Bot armed" : "Bot idle"}
        </span>
        <span className="text-slate-500">
          {strategies.filter((s) => s.enabled).length} armed strategies
        </span>
      </footer>
    </div>
  );
}
