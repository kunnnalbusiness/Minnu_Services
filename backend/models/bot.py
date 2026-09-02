from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

StrategyStatus = Literal[
    "idle", "waiting", "scanning", "trigger_wait", "pending_order", "in_position", "error", "stopped"
]
CoinPick = Literal["top_loser", "top_gainer"]
RuleSet = Literal[
    "legacy",
    "top4_5m_reversal_short",
    "highest_mover_sell",
    "Strategy4",
]
LogLevel = Literal["info", "signal", "trade", "error"]
Timeframe = Literal["5m", "15m", "30m", "1h", "4h", "1d"]
OrderType = Literal["market", "limit"]


class StrategyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    rule_set: RuleSet = "legacy"
    coin_pick: CoinPick = "top_loser"
    timeframe: Timeframe = "1h"
    order_type: OrderType = "market"
    capital_cap_inr: float = Field(default=40000, gt=0, le=1_000_000_000)
    leverage: float = Field(default=10, ge=1, le=50)
    tp_pct: float = Field(default=0.5, gt=0, le=20)
    sl_pct: float | None = Field(default=5.0, ge=0, le=50)
    max_trades_per_day: int = Field(default=5, ge=1, le=20)
    daily_target_inr: float = Field(default=25000, ge=0)


class StrategyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    timeframe: Timeframe | None = None
    order_type: OrderType | None = None
    capital_cap_inr: float | None = Field(default=None, gt=0, le=1_000_000_000)
    leverage: float | None = Field(default=None, ge=1, le=50)
    tp_pct: float | None = Field(default=None, gt=0, le=20)
    sl_pct: float | None = Field(default=None, ge=0, le=50)
    max_trades_per_day: int | None = Field(default=None, ge=1, le=20)
    daily_target_inr: float | None = Field(default=None, ge=0)


class Strategy(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str = "admin"
    name: str
    rule_set: RuleSet = "legacy"
    coin_pick: CoinPick = "top_loser"
    timeframe: Timeframe = "1h"
    order_type: OrderType = "market"
    capital_cap_inr: float = 40000
    leverage: float = 10
    tp_pct: float = 0.5
    sl_pct: float | None = 5.0
    max_trades_per_day: int = 5
    daily_target_inr: float = 25000
    enabled: bool = False
    status: StrategyStatus = "idle"
    detail: str = "Created — switch the bot on to arm this strategy."
    next_slot_ist: str | None = None
    trades_today: int = 0
    open_pair: str | None = None
    open_side: str | None = None
    entry_price: float | None = None
    tp_price: float | None = None
    sl_price: float | None = None
    created_at: str


class LogEntry(BaseModel):
    id: str
    owner_id: str = "admin"
    strategy_id: str | None = None
    strategy_name: str | None = None
    level: LogLevel
    message: str
    ts: str


class Trade(BaseModel):
    id: str
    owner_id: str = "admin"
    strategy_id: str
    strategy_name: str
    pair: str
    side: str = "sell"
    mode: str
    timeframe: str = "1h"
    entry_price: float
    tp_price: float
    sl_price: float | None = None
    quantity: float
    leverage: float
    capital_inr: float
    status: str
    exit_price: float | None = None
    pnl_pct: float | None = None
    pnl_inr: float | None = None
    opened_at: str
    closed_at: str | None = None
    order_id: str | None = None
    client_order_id: str | None = None
    position_id: str | None = None


class LivePosition(BaseModel):
    trade_id: str
    strategy_id: str
    strategy_name: str
    pair: str
    symbol: str
    side: str
    timeframe: str
    mode: str
    state: str                 # pending_order | open
    entry_price: float
    tp_price: float
    sl_price: float | None
    quantity: float
    leverage: float
    capital_inr: float
    last_price: float | None
    pnl_pct: float | None
    pnl_inr: float | None
    distance_to_tp_pct: float | None
    distance_to_sl_pct: float | None
    opened_at: str
    order_deadline_ist: str | None = None
    order_id: str | None = None
    client_order_id: str | None = None
    position_id: str | None = None


class CredentialStatus(BaseModel):
    configured: bool
    api_key_masked: str
    api_secret_masked: str
    live_trading: bool


class CredentialValidation(BaseModel):
    configured: bool = True
    live_ready: bool = True
    wallet_balance_inr: float = 0.0
    active_instruments_count: int = 0
    open_positions_count: int = 0
    usdt_inr_rate: float = 0.0
    message: str = "Credentials validated successfully."


class CredentialUpdate(BaseModel):
    api_key: str = Field(min_length=8, max_length=200)
    api_secret: str = Field(min_length=8, max_length=200)


class DayPnl(BaseModel):
    date: str
    pnl_inr: float
    trades: int
    wins: int
    losses: int


class TodaySummary(BaseModel):
    date: str
    server_time_ist: str
    pnl_inr: float
    target_inr: float
    target_achieved: bool
    trades_done: int
    max_trades: int
    open_trades: int
    trades: list[Trade]


class BotState(BaseModel):
    bot_on: bool
    execution_mode: str
    credentials_configured: bool
    timezone: str
    trading_window: str
    server_time_ist: str
    in_window: bool
    strategies: list[Strategy]


class ToggleRequest(BaseModel):
    on: bool
