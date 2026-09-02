// Mirrors backend/models/bot.py — keep both sides in sync in one edit.
export type StrategyStatus =
  | "idle"
  | "waiting"
  | "scanning"
  | "trigger_wait"
  | "pending_order"
  | "linking_position"
  | "in_position"
  | "error"
  | "stopped";
export type CoinPick = "top_loser" | "top_gainer";
export type RuleSet = "legacy" | "top4_5m_reversal_short" | "highest_mover_sell" | "Strategy4";
export type LogLevel = "info" | "signal" | "trade" | "error";
export type Timeframe = "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
export type OrderType = "market" | "limit";

export interface StrategyTemplate {
  rule_set: RuleSet;
  name: string;
  coin_pick: CoinPick;
  timeframe: Timeframe;
  order_type: OrderType;
  capital_cap_inr: number;
  leverage: number;
  tp_pct: number;
  sl_pct: number | null;
  max_trades_per_day: number;
  daily_target_inr: number;
}

export const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h", "4h", "1d"];

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    rule_set: "top4_5m_reversal_short",
    name: "2. 1PERIOD CYCLE",
    coin_pick: "top_gainer",
    timeframe: "1h",
    order_type: "market",
    capital_cap_inr: 40000,
    leverage: 10,
    tp_pct: 1.5,
    sl_pct: 1,
    max_trades_per_day: 5,
    daily_target_inr: 25000,
  },
  {
    rule_set: "highest_mover_sell",
    name: "3. HIGHEST MOVER SELL",
    coin_pick: "top_gainer",
    timeframe: "1h",
    order_type: "market",
    capital_cap_inr: 40000,
    leverage: 10,
    tp_pct: 5,
    sl_pct: 0,
    max_trades_per_day: 5,
    daily_target_inr: 25000,
  },
  {
    rule_set: "Strategy4",
    name: "4. 1HR VOL. CONF.",
    coin_pick: "top_loser",
    timeframe: "1h",
    order_type: "market",
    capital_cap_inr: 40000,
    leverage: 10,
    tp_pct: 1.5,
    sl_pct: 1,
    max_trades_per_day: 5,
    daily_target_inr: 25000,
  },
];

export interface Strategy {
  id: string;
  name: string;
  rule_set: RuleSet;
  coin_pick: CoinPick;
  timeframe: Timeframe;
  order_type: OrderType;
  capital_cap_inr: number;
  leverage: number;
  tp_pct: number;
  sl_pct: number | null;
  max_trades_per_day: number;
  daily_target_inr: number;
  enabled: boolean;
  status: StrategyStatus;
  detail: string;
  next_slot_ist: string | null;
  trades_today: number;
  open_pair: string | null;
  open_side: string | null;
  entry_price: number | null;
  tp_price: number | null;
  sl_price: number | null;
  created_at: string;
}

export interface LivePosition {
  trade_id: string;
  strategy_id: string;
  strategy_name: string;
  pair: string;
  symbol: string;
  side: string;
  timeframe: string;
  mode: string;
  state: string;
  entry_price: number;
  tp_price: number;
  sl_price: number | null;
  quantity: number;
  leverage: number;
  capital_inr: number;
  last_price: number | null;
  pnl_pct: number | null;
  pnl_inr: number | null;
  distance_to_tp_pct: number | null;
  distance_to_sl_pct: number | null;
  opened_at: string;
  order_deadline_ist: string | null;
  order_id?: string | null;
  client_order_id?: string | null;
  position_id?: string | null;
}

export interface CredentialStatus {
  configured: boolean;
  api_key_masked: string;
  api_secret_masked: string;
  live_trading: boolean;
}

export interface CredentialValidation {
  configured: boolean;
  live_ready: boolean;
  wallet_balance_inr: number;
  active_instruments_count: number;
  open_positions_count: number;
  usdt_inr_rate: number;
  message: string;
}

export interface StrategyCreate {
  name: string;
  rule_set: RuleSet;
  coin_pick: CoinPick;
  timeframe: Timeframe;
  order_type: OrderType;
  capital_cap_inr: number;
  leverage: number;
  tp_pct: number;
  sl_pct: number | null;
  max_trades_per_day: number;
  daily_target_inr: number;
}

export interface LogEntry {
  id: string;
  strategy_id: string | null;
  strategy_name: string | null;
  level: LogLevel;
  message: string;
  ts: string;
}

export interface Trade {
  id: string;
  strategy_id: string;
  strategy_name: string;
  pair: string;
  side: string;
  mode: string;
  timeframe: string;
  entry_price: number;
  tp_price: number;
  sl_price: number | null;
  quantity: number;
  leverage: number;
  capital_inr: number;
  status: string;
  exit_price: number | null;
  pnl_pct: number | null;
  pnl_inr: number | null;
  opened_at: string;
  closed_at: string | null;
  order_id?: string | null;
  client_order_id?: string | null;
  position_id?: string | null;
}

export interface DayPnl {
  date: string;
  pnl_inr: number;
  trades: number;
  wins: number;
  losses: number;
}

export interface TodaySummary {
  date: string;
  server_time_ist: string;
  pnl_inr: number;
  target_inr: number;
  target_achieved: boolean;
  trades_done: number;
  max_trades: number;
  open_trades: number;
  trades: Trade[];
}

export function fmtInr(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export const TRADE_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Order pending", className: "text-[#7f9bff]" },
  open: { label: "Running", className: "text-[#00c076]" },
  tp_hit: { label: "TP hit", className: "text-[#00c076]" },
  sl_hit: { label: "SL hit", className: "text-[#ff455b]" },
  cancelled: { label: "Cancelled", className: "text-slate-500" },
};

export interface BotState {
  bot_on: boolean;
  execution_mode: string;
  credentials_configured: boolean;
  timezone: string;
  trading_window: string;
  server_time_ist: string;
  in_window: boolean;
  strategies: Strategy[];
}

export const STATUS_STYLE: Record<StrategyStatus, { label: string; className: string }> = {
  idle: { label: "Idle", className: "bg-slate-500/12 text-slate-400" },
  stopped: { label: "Stopped", className: "bg-slate-500/12 text-slate-400" },
  waiting: { label: "Waiting", className: "bg-amber-500/12 text-amber-400" },
  scanning: { label: "Scanning", className: "bg-[#2e5cff]/15 text-[#7f9bff]" },
  trigger_wait: { label: "Waiting for red", className: "bg-amber-500/12 text-amber-400" },
  pending_order: { label: "Order pending", className: "bg-[#2e5cff]/15 text-[#7f9bff]" },
  linking_position: { label: "Confirming position", className: "bg-amber-500/12 text-amber-400" },
  in_position: { label: "Running", className: "bg-[#00c076]/12 text-[#00c076]" },
  error: { label: "Error", className: "bg-[#ff455b]/12 text-[#ff455b]" },
};

export const LEVEL_STYLE: Record<LogLevel, string> = {
  info: "text-slate-400",
  signal: "text-[#7f9bff]",
  trade: "text-[#00c076]",
  error: "text-[#ff455b]",
};
