from __future__ import annotations

from dataclasses import dataclass
from datetime import time as dtime
from decimal import Decimal
from typing import Any


WINDOW_START = dtime(5, 30)
WINDOW_END = dtime(3, 40)

TF_MINUTES: dict[str, int] = {
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
}

ORDER_WINDOW: dict[str, int] = {
    "5m": 60,
    "15m": 120,
    "1h": 300,
    "4h": 300,
}

TRIGGER_TF: dict[str, str] = {
    "5m": "1m",
    "15m": "1m",
    "30m": "1m",
    "1h": "1m",
}

PRESCAN_LEAD = 60
TICK_SECONDS = 2.0
MAX_LOGS = 400
MAX_TRADE_HISTORY = 400

FEE_SAFETY_BUFFER = Decimal("0.98")
LIVE_MARGIN_UTILIZATION_LIMIT = Decimal("0.70")
LIVE_MARGIN_MINIMUM = Decimal("250")

ORDER_RETRY_ATTEMPTS = 3
ORDER_RETRY_DELAY = 2.0

LIQUIDATION_CHECK_SECONDS = 10

DB_RETRY_ATTEMPTS = 3
DB_RETRY_DELAY = 1.0

STRATEGY_NAME = "1HR VOL. CONF."
RULE_SET = "Strategy4"
SIDE = "sell"


@dataclass
class Candle:
    time: str
    open: float
    high: float
    low: float
    close: float


@dataclass
class Ticker:
    symbol: str
    change_pct: float
    volume_24h: float | None = None
    quote_volume: float | None = None


class Strategy4:
    """Strategy 4.

    For now this is intentionally kept as a copy of Strategy 2 logic so the
    strategy can be introduced without changing the live trading behavior.
    """

    name = STRATEGY_NAME
    rule_set = RULE_SET
    side = SIDE
    selection_mode = "reversal"

    @staticmethod
    def ranked_candidates(pool: list[Any]) -> list[Any]:
        if not pool:
            return []
        return sorted(
            pool,
            key=lambda item: float(getattr(item, "change_pct", 0.0)),
            reverse=False,
        )[:4]

    @staticmethod
    def select_pair(tickers: dict[str, Ticker], candles: dict[str, list[Candle]]) -> str | None:
        ranked: list[tuple[float, str]] = []

        for symbol, ticker in tickers.items():
            if ticker.change_pct <= 0:
                continue
            series = candles.get(symbol, [])
            if len(series) < 2:
                continue

            recent = series[-2:]
            prev_close = recent[0].close
            last_close = recent[1].close

            if prev_close <= last_close:
                continue

            ranked.append((ticker.change_pct, symbol))

        if not ranked:
            return None

        ranked.sort(key=lambda item: item[0], reverse=True)
        return ranked[0][1]

    @staticmethod
    def should_enter(symbol: str, ticker: Ticker, series: list[Candle]) -> bool:
        if ticker.change_pct <= 0:
            return False
        if len(series) < 2:
            return False

        last = series[-1]
        prev = series[-2]

        return prev.close <= last.close and last.close < prev.high

    @staticmethod
    def build_signal(symbol: str, ticker: Ticker, series: list[Candle]) -> dict[str, Any]:
        last = series[-1]
        return {
            "name": STRATEGY_NAME,
            "rule_set": RULE_SET,
            "pair": symbol,
            "side": SIDE,
            "entry": float(last.close),
            "change_pct": float(ticker.change_pct),
            "reason": "Strategy 4 copy of Strategy 2 logic",
        }


__all__ = [
    "Strategy4",
    "STRATEGY_NAME",
    "RULE_SET",
    "SIDE",
    "WINDOW_START",
    "WINDOW_END",
    "TF_MINUTES",
    "ORDER_WINDOW",
    "TRIGGER_TF",
    "PRESCAN_LEAD",
    "TICK_SECONDS",
    "MAX_LOGS",
    "MAX_TRADE_HISTORY",
    "FEE_SAFETY_BUFFER",
    "LIVE_MARGIN_UTILIZATION_LIMIT",
    "LIVE_MARGIN_MINIMUM",
    "ORDER_RETRY_ATTEMPTS",
    "ORDER_RETRY_DELAY",
    "LIQUIDATION_CHECK_SECONDS",
    "DB_RETRY_ATTEMPTS",
    "DB_RETRY_DELAY",
]
