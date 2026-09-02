"""Strategy engine: timeframe-slot bot driven by the live scanner feed.

Flow per slot (IST clock):
1. 60s before the slot  → scan the top 4 coins from the live scanner.
2. At the slot          → read the just-closed candle on the strategy's timeframe.
                            GREEN → BUY, RED → SELL. Of the candidates with a clear
                            candle, take the strongest absolute 24h mover.
3. Immediately          → LIMIT order at that candle's closing price, with TP and SL
                            derived from the entry and the side.
4. Fill window          → 5m: 1 min, 15m: 2 min, 1h/4h: 5 min. Unfilled → cancel and
                            wait for the next slot.
5. In position          → monitor the live price and exit on TP or SL.

Signals come from the USDT chart (what the scanner ranks on); execution uses INR margin
on that same pair, which is what the INR futures wallet funds.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import datetime, time as dtime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from lib import candles as candle_api
from lib import coindcx_trade as trade
from lib.clock import now_ist, sync_exchange_clock
from lib.config import (
    RUNTIME_DB_RETRY_ATTEMPTS,
    RUNTIME_DB_RETRY_DELAY,
    RUNTIME_FEE_SAFETY_BUFFER,
    RUNTIME_LIQUIDATION_CHECK_SECONDS,
    RUNTIME_LINK_RETRY_SECONDS,
    RUNTIME_LINK_TIMEOUT_SECONDS,
    RUNTIME_LIVE_MARGIN_MINIMUM,
    RUNTIME_LIVE_MARGIN_UTILIZATION_LIMIT,
    RUNTIME_ORDER_RETRY_ATTEMPTS,
    RUNTIME_ORDER_RETRY_DELAY,
    get_decimal,
)
from lib.db import db
from lib.market_store import store
from models.bot import BotState, LivePosition, LogEntry, Strategy, Trade
from strategies.registry import (
    get_strategy_mode,
    get_strategy_module,
    get_strategy_prescan_lead,
    get_strategy_runtime_config,
)

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

FEE_SAFETY_BUFFER = get_decimal("RUNTIME_FEE_SAFETY_BUFFER", RUNTIME_FEE_SAFETY_BUFFER)
LIVE_MARGIN_UTILIZATION_LIMIT = get_decimal(
    "RUNTIME_LIVE_MARGIN_UTILIZATION_LIMIT",
    RUNTIME_LIVE_MARGIN_UTILIZATION_LIMIT,
)
LIVE_MARGIN_MINIMUM = get_decimal("RUNTIME_LIVE_MARGIN_MINIMUM", RUNTIME_LIVE_MARGIN_MINIMUM)

ORDER_RETRY_ATTEMPTS = int(RUNTIME_ORDER_RETRY_ATTEMPTS)
ORDER_RETRY_DELAY = float(RUNTIME_ORDER_RETRY_DELAY)

LINK_TIMEOUT_SECONDS = int(RUNTIME_LINK_TIMEOUT_SECONDS)
LINK_RETRY_SECONDS = int(RUNTIME_LINK_RETRY_SECONDS)

LIQUIDATION_CHECK_SECONDS = int(RUNTIME_LIQUIDATION_CHECK_SECONDS)

DB_RETRY_ATTEMPTS = int(RUNTIME_DB_RETRY_ATTEMPTS)
DB_RETRY_DELAY = float(RUNTIME_DB_RETRY_DELAY)


class StrategyRuntimeService:
    """Own strategy runtime configuration and scheduling policy."""

    def config(self, rule_set: str | None = None) -> dict[str, Any]:
        return get_strategy_runtime_config(rule_set or "top4_5m_reversal_short")

    def value(self, rule_set: str | None, key: str, default: Any = None) -> Any:
        return self.config(rule_set).get(key, default)

    def window_bounds(self, rule_set: str | None = None) -> tuple[dtime, dtime]:
        cfg = self.config(rule_set)
        return cfg.get("WINDOW_START", dtime(5, 30)), cfg.get("WINDOW_END", dtime(3, 40))

    def in_window(self, moment: datetime | None = None, rule_set: str | None = None) -> bool:
        start, end = self.window_bounds(rule_set)
        current = (moment or now_ist()).time()
        return current >= start or current <= end

    def order_window(self, timeframe: str, rule_set: str | None = None) -> int:
        return self.value(rule_set, "ORDER_WINDOW", {}).get(timeframe, 300)


class OrderService:
    """Own retry policy for exchange order submission."""

    async def submit(
        self,
        market_entry: bool,
        pair: str,
        side: str,
        quantity: Decimal,
        leverage: float,
        price: Decimal,
        client_order_id: str | None = None,
    ) -> dict[str, Any]:
        last_exc: Exception | None = None
        for attempt in range(1, ORDER_RETRY_ATTEMPTS + 1):
            try:
                if market_entry:
                    return await trade.place_market(pair, side, quantity, leverage, client_order_id=client_order_id)
                return await trade.place_limit(pair, side, price, quantity, leverage, client_order_id=client_order_id)
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "order attempt %d/%d failed for %s: %s",
                    attempt,
                    ORDER_RETRY_ATTEMPTS,
                    pair,
                    exc,
                )
                if attempt < ORDER_RETRY_ATTEMPTS:
                    await asyncio.sleep(ORDER_RETRY_DELAY)
        assert last_exc is not None
        raise last_exc


runtime_service = StrategyRuntimeService()
order_service = OrderService()


def strategy_runtime_config(rule_set: str | None = None) -> dict[str, Any]:
    return runtime_service.config(rule_set)


def strategy_runtime_value(
    rule_set: str | None,
    key: str,
    default: Any = None,
) -> Any:
    return runtime_service.value(rule_set, key, default)


def strategy_window_bounds(rule_set: str | None = None) -> tuple[dtime, dtime]:
    return runtime_service.window_bounds(rule_set)


def in_window(moment: datetime | None = None, rule_set: str | None = None) -> bool:
    return runtime_service.in_window(moment, rule_set)


def order_window(timeframe: str, rule_set: str | None = None) -> int:
    return runtime_service.order_window(timeframe, rule_set)


def _valid_hourly_slots_for_day(
    day: datetime.date,
    tz: ZoneInfo | None = None,
    rule_set: str | None = None,
) -> list[datetime]:
    tz = tz or IST

    window_start, _ = strategy_window_bounds(rule_set)
    start = datetime.combine(
        day,
        window_start,
        tzinfo=tz,
    )

    _, window_end = strategy_window_bounds(rule_set)
    end = datetime.combine(
        day + timedelta(days=1),
        window_end,
        tzinfo=tz,
    )

    out: list[datetime] = []
    cursor = start

    while cursor <= end:
        out.append(cursor)
        cursor += timedelta(hours=1)

    return out


def next_slot(
    moment: datetime,
    timeframe: str = "1h",
    rule_set: str | None = None,
) -> datetime:
    minutes = strategy_runtime_config(rule_set).get("TF_MINUTES", {}).get(
        timeframe,
        60,
    )

    if minutes == 60:
        tz = moment.tzinfo or IST

        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=tz)

        session_slots = (
            _valid_hourly_slots_for_day(
                moment.date() - timedelta(days=1),
                tz,
                rule_set=rule_set,
            )
            + _valid_hourly_slots_for_day(
                moment.date(),
                tz,
                rule_set=rule_set,
            )
        )

        future = [
            slot
            for slot in session_slots
            if slot > moment
        ]

        if future:
            return min(future)

        return _valid_hourly_slots_for_day(
            moment.date() + timedelta(days=1),
            tz,
            rule_set=rule_set,
        )[0]

    anchor = moment.replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )

    elapsed = (
        moment - anchor
    ).total_seconds() / 60

    steps = int(
        elapsed // minutes
    ) + 1

    slot = anchor + timedelta(
        minutes=steps * minutes
    )

    while not in_window(slot, rule_set):
        slot += timedelta(
            minutes=minutes
        )

    return slot


def candle_side(
    candle: dict[str, Any],
) -> str | None:
    if candle["close"] > candle["open"]:
        return "buy"

    if candle["close"] < candle["open"]:
        return "sell"

    return None


def candle_close_label(
    candle: dict[str, Any],
    timeframe_minutes: int,
) -> str:
    timestamp = float(
        candle["time"]
    )

    if timestamp > 10_000_000_000:
        timestamp /= 1000

    start = datetime.fromtimestamp(
        timestamp,
        IST,
    )

    end = (
        start
        + timedelta(minutes=timeframe_minutes)
    )

    def clock_value(
        value: datetime,
    ) -> str:
        hour = value.hour % 12 or 12
        return f"{hour:02d}:{value.minute:02d}"

    period = (
        "pm"
        if start.hour >= 12
        else "am"
    )

    return (
        f"{clock_value(start)} - "
        f"{clock_value(end)} = "
        f"{clock_value(start)}{period}"
    )


def candle_is_closed(
    candle: dict[str, Any],
    timeframe_minutes: int,
    now: datetime,
) -> bool:
    timestamp = float(
        candle["time"]
    )

    if timestamp > 10_000_000_000:
        timestamp /= 1000

    close_at = (
        datetime.fromtimestamp(
            timestamp,
            IST,
        )
        + timedelta(
            minutes=timeframe_minutes
        )
    )

    return close_at <= now


def current_slot_boundary(
    now: datetime,
    timeframe_minutes: int,
) -> datetime:
    if timeframe_minutes == 60:
        tz = now.tzinfo or IST

        if now.tzinfo is None:
            now = now.replace(
                tzinfo=tz
            )

        cand: list[datetime] = []

        cand.extend(
            _valid_hourly_slots_for_day(
                now.date() - timedelta(days=1),
                tz,
            )
        )

        cand.extend(
            _valid_hourly_slots_for_day(
                now.date(),
                tz,
            )
        )

        valid = [
            slot
            for slot in cand
            if slot <= now
        ]

        if not valid:
            return _valid_hourly_slots_for_day(
                now.date() - timedelta(days=1),
                tz,
            )[-1]

        return max(valid)

    anchor = now.replace(
        second=0,
        microsecond=0,
    )

    minute = (
        anchor.minute
        // timeframe_minutes
    ) * timeframe_minutes

    return anchor.replace(
        minute=minute
    )


def tp_sl_for(
    side: str,
    entry: float,
    tp_pct: float,
    sl_pct: float | None,
) -> tuple[float, float | None]:
    """Calculate TP and SL.

    sl_pct:
        None or 0  -> no stop loss.
        > 0         -> create stop loss.

    This intentionally treats 0 as "NO SL".
    """

    if side == "buy":
        return (
            entry * (1 + tp_pct / 100),
            (
                entry * (1 - sl_pct / 100)
                if sl_pct is not None
                and sl_pct > 0
                else None
            ),
        )

    return (
        entry * (1 - tp_pct / 100),
        (
            entry * (1 + sl_pct / 100)
            if sl_pct is not None
            and sl_pct > 0
            else None
        ),
    )


def pnl_pct_for(
    side: str,
    entry: float,
    price: float,
    leverage: float,
) -> float:
    move = (
        (price - entry) / entry
        if side == "buy"
        else (entry - price) / entry
    )

    return move * 100 * leverage


def price_label(
    value: float | None,
) -> str:
    return (
        f"{value:.8f}"
        if value is not None
        else "off"
    )


def percent_label(
    value: float | None,
) -> str:
    return (
        f"{value:+.2f}%"
        if value is not None
        else "n/a"
    )


def filled_quantity(
    status: dict[str, Any],
    fallback: float,
) -> float:
    for key in (
        "filled_quantity",
        "executed_quantity",
        "filled_qty",
    ):
        if status.get(key) is not None:
            return float(
                status[key]
            )

    total = (
        status.get("total_quantity")
        or status.get("quantity")
    )

    remaining = status.get(
        "remaining_quantity"
    )

    if (
        total is not None
        and remaining is not None
    ):
        return max(
            float(total)
            - float(remaining),
            0.0,
        )

    return fallback


def live_capital_limit(
    strategy_capital: Decimal,
    wallet_balance: Decimal,
) -> Decimal:
    if wallet_balance <= 0:
        return Decimal("0")

    usable = (
        wallet_balance
        * LIVE_MARGIN_UTILIZATION_LIMIT
    )

    return max(
        Decimal("0"),
        min(
            strategy_capital,
            usable,
        ),
    )


def position_is_open(
    pos: dict[str, Any] | None,
) -> bool:
    if not pos:
        return False

    if "is_open" in pos:
        return bool(
            pos["is_open"]
        )

    status = str(
        pos.get("status") or ""
    ).lower()

    if status:
        return status not in (
            "closed",
            "liquidated",
            "exited",
        )

    return True


async def send_order_with_retry(
    market_entry: bool,
    pair: str,
    side: str,
    quantity: Decimal,
    leverage: float,
    price: Decimal,
) -> dict[str, Any]:
    return await order_service.submit(
        market_entry, pair, side, quantity, leverage, price
    )


class Runtime:
    def __init__(self) -> None:
        self.phase: str = "waiting"
        self.slot: datetime | None = None
        self.candidates: list[str] = []
        self.pair: str | None = None
        self.side: str | None = None
        self.trade_id: str | None = None
        self.order_id: str | None = None
        self.client_order_id: str | None = None
        self.position_id: str | None = None
        self.entry: float | None = None
        self.tp: float | None = None
        self.sl: float | None = None
        self.quantity: float = 0.0
        self.leverage: float = 10
        self.capital: float = 0.0
        self.order_deadline: datetime | None = None
        self.trigger_deadline: datetime | None = None
        self.link_deadline: datetime | None = None
        self.pending_avg_price: float = 0.0
        self.pending_filled_qty: float = 0.0
        self.last_link_check: float = 0.0
        self.seen_green_trigger = False
        self.last_trigger_candle: str | None = None
        self.last_order_check: float = 0.0
        self.trades_today: int = 0
        self.day: str = ""


class BotEngine:
    def __init__(
        self,
        owner_id: str = "admin",
        runtime_service: StrategyRuntimeService | None = None,
        order_service: OrderService | None = None,
    ) -> None:
        self.owner_id = (
            owner_id.strip().lower()
            or "admin"
        )

        self.loaded = False
        self.bot_on = False
        self.runtime_service = runtime_service or StrategyRuntimeService()
        self.order_service = order_service or OrderService()

        self.strategies: dict[
            str,
            Strategy,
        ] = {}

        self.runtime: dict[
            str,
            Runtime,
        ] = {}

        self.logs: list[LogEntry] = []

        self._subscribers: set[
            asyncio.Queue[str]
        ] = set()

        self._task: asyncio.Task[
            None
        ] | None = None

        self._inr_pairs: set[str] = set()

        self._inr_detail: dict[
            str,
            dict[str, Any],
        ] = {}

    def subscribe(
        self,
    ) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = (
            asyncio.Queue(maxsize=50)
        )

        self._subscribers.add(q)
        return q

    def unsubscribe(
        self,
        q: asyncio.Queue[str],
    ) -> None:
        self._subscribers.discard(q)

    def _push(
        self,
        payload: dict[str, Any],
    ) -> None:
        text = json.dumps(payload)

        for q in list(
            self._subscribers
        ):
            if q.full():
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass

            try:
                q.put_nowait(text)
            except asyncio.QueueFull:
                pass

    def log(
        self,
        level: str,
        message: str,
        strategy: Strategy | None = None,
    ) -> LogEntry:
        entry = LogEntry(
            id=str(uuid.uuid4()),
            owner_id=self.owner_id,
            strategy_id=(
                strategy.id
                if strategy
                else None
            ),
            strategy_name=(
                strategy.name
                if strategy
                else None
            ),
            level=level,
            message=message,
            ts=now_ist().isoformat(
                timespec="seconds"
            ),
        )

        self.logs.append(entry)

        strategy_rule = strategy.rule_set if strategy else None
        max_logs = strategy_runtime_value(strategy_rule, "MAX_LOGS", 400)
        if len(self.logs) > max_logs:
            del self.logs[:-max_logs]

        self._push(
            {
                "type": "log",
                "log": entry.model_dump(),
            }
        )

        asyncio.create_task(
            self._persist_log(entry)
        )

        return entry

    async def _persist_log(
        self,
        entry: LogEntry,
    ) -> None:
        try:
            await db.bot_logs.insert_one(
                entry.model_dump()
            )

            count = (
                await db.bot_logs.count_documents(
                    {
                        "owner_id": self.owner_id
                    }
                )
            )

            max_logs = strategy_runtime_value("top4_5m_reversal_short", "MAX_LOGS", 400)
            if count > max_logs:
                old_logs = await (
                    db.bot_logs.find(
                        {
                            "owner_id": self.owner_id
                        },
                        {"_id": 1},
                    )
                    .sort(
                        [
                            ("ts", -1),
                            ("_id", -1),
                        ]
                    )
                    .skip(max_logs)
                    .to_list(length=None)
                )

                ids = [
                    doc["_id"]
                    for doc in old_logs
                ]

                if ids:
                    await db.bot_logs.delete_many(
                        {
                            "_id": {
                                "$in": ids
                            },
                            "owner_id": self.owner_id,
                        }
                    )

        except Exception as exc:
            logger.warning(
                "bot log persistence failed for %s: %s",
                entry.id,
                exc,
            )

    async def _prune_trade_history(
        self,
    ) -> None:
        try:
            count = (
                await db.trades.count_documents(
                    {
                        "owner_id": self.owner_id
                    }
                )
            )

            max_trade_history = strategy_runtime_value(
                "top4_5m_reversal_short",
                "MAX_TRADE_HISTORY",
                400,
            )
            if count <= max_trade_history:
                return

            docs = await (
                db.trades.find(
                    {
                        "owner_id": self.owner_id
                    },
                    {"_id": 1},
                )
                .sort("opened_at", 1)
                .limit(
                    count - max_trade_history
                )
                .to_list(length=None)
            )

            ids = [
                doc["_id"]
                for doc in docs
                if "_id" in doc
            ]

            if not ids:
                return

            await db.trades.delete_many(
                {
                    "_id": {
                        "$in": ids
                    },
                    "owner_id": self.owner_id,
                }
            )

        except Exception as exc:
            logger.warning(
                "trade history compaction failed: %s",
                exc,
            )

    def _push_state(self) -> None:
        self._push(
            {
                "type": "state",
                "state": self.state().model_dump(),
            }
        )

    def state(self) -> BotState:
        return BotState(
            bot_on=self.bot_on,
            execution_mode=trade.mode(),
            credentials_configured=all(
                trade.credentials()
            ),
            timezone="Asia/Kolkata",
            trading_window=(
                "05:30 → 03:40 IST · slots follow "
                "each strategy's timeframe"
            ),
            server_time_ist=now_ist().isoformat(
                timespec="seconds"
            ),
            in_window=in_window(),
            strategies=list(
                self.strategies.values()
            ),
        )

    def positions(
        self,
    ) -> list[LivePosition]:
        out: list[LivePosition] = []

        for s in self.strategies.values():
            rt = self.runtime.get(s.id)

            if (
                rt is None
                or rt.phase
                not in (
                    "pending_order",
                    "in_position",
                )
                or not rt.pair
            ):
                continue

            ticker = store.tickers.get(
                rt.pair
            )

            last = (
                ticker.last
                if ticker
                else None
            )

            entry = rt.entry or 0.0
            side = rt.side or "sell"

            pnl_pct = (
                pnl_pct_for(
                    side,
                    entry,
                    last,
                    rt.leverage,
                )
                if last and entry
                else None
            )

            out.append(
                LivePosition(
                    trade_id=(
                        rt.trade_id or ""
                    ),
                    strategy_id=s.id,
                    strategy_name=s.name,
                    pair=rt.pair,
                    symbol=(
                        ticker.symbol
                        if ticker
                        else rt.pair
                    ),
                    side=side,
                    timeframe=s.timeframe,
                    mode=trade.mode(),
                    state=rt.phase,
                    entry_price=entry,
                    tp_price=rt.tp or 0.0,
                    sl_price=rt.sl,
                    quantity=rt.quantity,
                    leverage=rt.leverage,
                    capital_inr=rt.capital,
                    last_price=last,
                    pnl_pct=pnl_pct,
                    pnl_inr=(
                        rt.capital
                        * pnl_pct
                        / 100
                    )
                    if pnl_pct is not None
                    else None,
                    distance_to_tp_pct=(
                        (rt.tp - last)
                        / last
                        * 100
                    )
                    if last and rt.tp
                    else None,
                    distance_to_sl_pct=(
                        (rt.sl - last)
                        / last
                        * 100
                    )
                    if last and rt.sl
                    else None,
                    opened_at=(
                        rt.slot
                        or now_ist()
                    ).isoformat(
                        timespec="seconds"
                    ),
                    order_deadline_ist=(
                        rt.order_deadline.strftime(
                            "%H:%M:%S"
                        )
                        if rt.order_deadline
                        else None
                    ),
                    order_id=rt.order_id,
                    client_order_id=rt.client_order_id,
                    position_id=rt.position_id,
                )
            )

        return out

    def _set(
        self,
        s: Strategy,
        status: str,
        detail: str,
    ) -> None:
        if (
            s.status != status
            or s.detail != detail
        ):
            s.status = status
            s.detail = detail

            asyncio.create_task(
                self._save(s)
            )

            self._push_state()

    async def _save(
        self,
        s: Strategy,
    ) -> None:
        try:
            await db.strategies.update_one(
                {
                    "id": s.id,
                    "owner_id": self.owner_id,
                },
                {
                    "$set": s.model_dump()
                },
                upsert=True,
            )
        except Exception:
            pass

    async def _insert_trade(
        self,
        payload: dict[str, Any],
    ) -> None:
        for attempt in range(
            1,
            DB_RETRY_ATTEMPTS + 1,
        ):
            try:
                payload["owner_id"] = self.owner_id

                await db.trades.insert_one(
                    payload
                )

                await self._prune_trade_history()
                return

            except Exception as exc:
                if (
                    attempt
                    == DB_RETRY_ATTEMPTS
                ):
                    logger.error(
                        "trade insert failed after retries for %s: %s",
                        payload.get("id"),
                        exc,
                    )
                    return

                await asyncio.sleep(
                    DB_RETRY_DELAY
                )

    async def _update_trade(
        self,
        trade_id: str | None,
        fields: dict[str, Any],
    ) -> None:
        if not trade_id:
            logger.error(
                "trade update skipped because trade_id is missing: %s",
                fields,
            )
            return

        for attempt in range(
            1,
            DB_RETRY_ATTEMPTS + 1,
        ):
            try:
                result = await db.trades.update_one(
                    {
                        "id": trade_id,
                        "owner_id": self.owner_id,
                    },
                    {
                        "$set": fields
                    },
                )

                if result.matched_count == 0:
                    logger.error(
                        "trade update found no record for trade_id=%s",
                        trade_id,
                    )

                return

            except Exception as exc:
                if (
                    attempt
                    == DB_RETRY_ATTEMPTS
                ):
                    logger.error(
                        "trade update failed after retries for %s: %s",
                        trade_id,
                        exc,
                    )
                    return

                await asyncio.sleep(
                    DB_RETRY_DELAY
                )

    async def load(self) -> None:
        # Prevent duplicate engine loops on concurrent calls.
        if self.loaded:
            return

        from lib import credentials as creds

        creds.set_user(
            self.owner_id
        )

        try:
            await sync_exchange_clock()
        except Exception as exc:
            logger.warning(
                "CoinDCX clock sync failed; using local clock: %s",
                exc,
            )

        await self._prune_trade_history()

        try:
            max_logs = strategy_runtime_value("top4_5m_reversal_short", "MAX_LOGS", 400)
            log_docs = await (
                db.bot_logs.find(
                    {
                        "owner_id": self.owner_id
                    }
                )
                .sort("ts", -1)
                .to_list(max_logs)
            )

            self.logs = []

            for doc in reversed(log_docs):
                doc.pop("_id", None)

                try:
                    self.logs.append(
                        LogEntry(**doc)
                    )
                except Exception as exc:
                    logger.warning(
                        "invalid persisted bot log skipped: %s",
                        exc,
                    )

        except Exception as exc:
            logger.warning(
                "bot log history load failed: %s",
                exc,
            )

        try:
            settings = (
                await db.bot_settings.find_one(
                    {
                        "id": "runtime",
                        "owner_id": self.owner_id,
                    }
                )
            )

            self.bot_on = bool(
                settings
                and settings.get(
                    "bot_on",
                    False,
                )
            )

            docs = await db.strategies.find(
                {
                    "owner_id": self.owner_id
                }
            ).to_list(200)

            for doc in docs:
                doc.pop("_id", None)
                doc.pop("open_side", None)
                doc.pop("sl_price", None)

                s = Strategy(**doc)

                self.strategies[s.id] = s

                rt = Runtime()
                self.runtime[s.id] = rt

                await self._recover_open_trade(
                    s,
                    rt,
                )

                if rt.phase in (
                    "in_position",
                    "pending_order",
                ):
                    continue

                s.status = (
                    "stopped"
                    if s.enabled
                    else "idle"
                )

                s.detail = (
                    "Reloaded after restart — "
                    "switch the bot on to arm."
                )

                if (
                    self.bot_on
                    and s.enabled
                ):
                    s.status = "waiting"
                    s.detail = (
                        "Armed after restart — "
                        "waiting for the next slot."
                    )

        except Exception as exc:
            logger.warning(
                "strategy load failed: %s",
                exc,
            )

        self._task = asyncio.create_task(
            self._loop()
        )

        self.loaded = True

    async def _recover_open_trade(
        self,
        s: Strategy,
        rt: Runtime,
    ) -> None:
        try:
            doc = await db.trades.find_one(
                {
                    "strategy_id": s.id,
                    "owner_id": self.owner_id,
                    "status": {
                        "$in": [
                            "open",
                            "pending",
                        ]
                    },
                },
                sort=[
                    ("opened_at", -1)
                ],
            )

        except Exception as exc:
            logger.warning(
                "trade recovery lookup failed for %s: %s",
                s.name,
                exc,
            )
            return

        if not doc:
            return

        position_id = (
            doc.get("position_id")
            or ""
        )

        order_id = (
            doc.get("order_id")
            or ""
        )

        still_open = True

        if (
            trade.live_enabled()
            and position_id
        ):
            try:
                pos = await trade.position_status(
                    position_id
                )

                still_open = position_is_open(
                    pos
                )

            except Exception as exc:
                self.log(
                    "error",
                    f"Could not verify {s.name}'s recovered position on the exchange: {exc}",
                    s,
                )

        if not still_open:
            await self._update_trade(
                doc.get("id"),
                {
                    "status": "closed_offline",
                    "closed_at": now_ist().isoformat(
                        timespec="seconds"
                    ),
                },
            )

            self.log(
                "info",
                f"{s.name}: recovered trade on {doc.get('pair')} had already closed while the bot was down.",
                s,
            )

            return

        rt.trade_id = doc.get("id")
        rt.pair = doc.get("pair")
        rt.side = doc.get("side")
        rt.entry = doc.get("entry_price")
        rt.tp = doc.get("tp_price")
        rt.sl = doc.get("sl_price")

        rt.quantity = (
            doc.get("quantity")
            or 0.0
        )

        rt.leverage = (
            doc.get("leverage")
            or s.leverage
        )

        rt.capital = (
            doc.get("capital_inr")
            or 0.0
        )

        rt.order_id = (
            order_id
            or None
        )

        rt.position_id = (
            position_id
            or None
        )

        rt.phase = (
            "in_position"
            if doc.get("status")
            == "open"
            else "pending_order"
        )

        if rt.phase == "pending_order":
            rt.order_deadline = (
                now_ist()
                + timedelta(
                    seconds=order_window(
                        s.timeframe
                    )
                )
            )

        s.open_pair = rt.pair
        s.open_side = rt.side
        s.entry_price = rt.entry
        s.tp_price = rt.tp
        s.sl_price = rt.sl

        action = (
            "monitoring"
            if rt.phase == "in_position"
            else "awaiting a fill on"
        )

        self._set(
            s,
            rt.phase,
            f"Recovered after restart — {action} {rt.pair}.",
        )

        self.log(
            "info",
            f"{s.name}: recovered {rt.phase} on {rt.pair} from before restart (entry {rt.entry}, TP {rt.tp}).",
            s,
        )

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

            try:
                await self._task
            except (
                asyncio.CancelledError,
                Exception,
            ):
                pass

    async def add(
        self,
        s: Strategy,
    ) -> Strategy:
        s.owner_id = self.owner_id

        self.strategies[s.id] = s
        self.runtime[s.id] = Runtime()

        await self._save(s)

        self.log(
            "info",
            f"Strategy '{s.name}' added ({s.timeframe} slots, {s.coin_pick}, {s.leverage}x, "
            f"TP {s.tp_pct}% / SL {s.sl_pct or 0}%).",
            s,
        )

        self._push_state()

        return s

    async def remove(
        self,
        sid: str,
    ) -> bool:
        s = self.strategies.pop(
            sid,
            None,
        )

        self.runtime.pop(
            sid,
            None,
        )

        if s is None:
            return False

        await db.strategies.delete_one(
            {
                "id": sid,
                "owner_id": self.owner_id,
            }
        )

        self.log(
            "info",
            f"Strategy '{s.name}' deleted.",
            s,
        )

        self._push_state()

        return True

    async def update(
        self,
        sid: str,
        changes: dict[str, Any],
    ) -> Strategy | None:
        strategy = self.strategies.get(
            sid
        )

        if strategy is None:
            return None

        for key, value in changes.items():
            if (
                value is not None
                and key
                not in {
                    "id",
                    "owner_id",
                    "enabled",
                    "status",
                }
            ):
                setattr(
                    strategy,
                    key,
                    value,
                )

        await self._save(strategy)

        self.log(
            "info",
            f"Strategy '{strategy.name}' updated.",
            strategy,
        )

        self._push_state()

        return strategy

    async def set_enabled(
        self,
        sid: str,
        enabled: bool,
    ) -> Strategy | None:
        s = self.strategies.get(
            sid
        )

        if s is None:
            return None

        s.enabled = enabled

        rt = self.runtime.setdefault(
            sid,
            Runtime(),
        )

        if not enabled:
            rt.phase = "waiting"

            self._set(
                s,
                "stopped",
                "Disabled by operator.",
            )

        else:
            self._set(
                s,
                "waiting",
                "Armed — waiting for the next slot.",
            )

        self.log(
            "info",
            f"Strategy '{s.name}' "
            f"{'armed' if enabled else 'disabled'}.",
            s,
        )

        await self._save(s)

        return s

    async def set_bot(
        self,
        on: bool,
    ) -> None:
        self.bot_on = on

        try:
            await db.bot_settings.update_one(
                {
                    "id": "runtime",
                    "owner_id": self.owner_id,
                },
                {
                    "$set": {
                        "id": "runtime",
                        "owner_id": self.owner_id,
                        "bot_on": on,
                    }
                },
                upsert=True,
            )

        except Exception as exc:
            logger.warning(
                "could not persist bot state: %s",
                exc,
            )

        self.log(
            "info",
            f"BOT {'ON' if on else 'OFF'} — execution mode {trade.mode()}.",
        )

        if not on:
            for s in self.strategies.values():
                rt = self.runtime.setdefault(
                    s.id,
                    Runtime(),
                )

                if rt.phase not in (
                    "in_position",
                    "pending_order",
                    "trigger_wait",
                    "linking_position",
                ):
                    rt.phase = "waiting"
                    self._set(
                        s,
                        "stopped",
                        "Bot is off.",
                    )

        self._push_state()

    async def _loop(self) -> None:
        from lib import credentials as creds

        creds.set_user(
            self.owner_id
        )

        while True:
            try:
                await self._tick()

            except asyncio.CancelledError:
                raise

            except Exception as exc:
                logger.warning(
                    "engine tick failed: %s",
                    exc,
                )

            tick_seconds = min(
                (
                    strategy_runtime_value(s.rule_set, "TICK_SECONDS", 2.0)
                    for s in self.strategies.values()
                ),
                default=2.0,
            )
            await asyncio.sleep(
                tick_seconds
            )

    async def _tick(self) -> None:
        now = now_ist()
        today = now.date().isoformat()

        for s in list(
            self.strategies.values()
        ):
            try:
                await self._process_strategy(
                    s,
                    now,
                    today,
                )

            except Exception as exc:
                logger.error(
                    "Strategy %s tick failed: %s",
                    s.name,
                    exc,
                )

                self.log(
                    "error",
                    f"Strategy {s.name} tick failed: {exc}",
                    s,
                )

        self._push(
            {
                "type": "positions",
                "positions": [
                    position.model_dump()
                    for position in self.positions()
                ],
            }
        )

    async def _process_strategy(
        self,
        s: Strategy,
        now: datetime,
        today: str,
    ) -> None:
        rt = self.runtime.setdefault(
            s.id,
            Runtime(),
        )

        if rt.day != today:
            rt.day = today
            rt.trades_today = 0
            s.trades_today = 0

            asyncio.create_task(
                self._save(s)
            )

        if rt.phase == "in_position":
            await self._monitor(
                s,
                rt,
            )
            return

        if rt.phase == "pending_order":
            await self._await_fill(
                s,
                rt,
                now,
            )
            return

        if rt.phase == "trigger_wait":
            await self._await_reversal_trigger(
                s,
                rt,
                now,
            )
            return

        if rt.phase == "linking_position":
            await self._await_position_link(
                s,
                rt,
                now,
            )
            return

        if (
            not self.bot_on
            or not s.enabled
        ):
            return

        if (
            rt.trades_today
            >= s.max_trades_per_day
        ):
            self._set(
                s,
                "waiting",
                f"Daily cap reached ({rt.trades_today}/{s.max_trades_per_day} trades).",
            )
            return

        slot = (
            rt.slot
            if rt.slot
            and rt.slot
            > now - timedelta(minutes=2)
            else next_slot(
                now,
                s.timeframe,
                rule_set=s.rule_set,
            )
        )

        rt.slot = slot

        s.next_slot_ist = slot.strftime(
            "%H:%M IST"
        )

        seconds_to_slot = (
            slot - now
        ).total_seconds()

        prescan_lead = (
            120
            if s.rule_set == "top4_5m_reversal_short"
            else get_strategy_prescan_lead(s.rule_set)
        )

        if rt.phase == "waiting":
            if (
                seconds_to_slot
                <= prescan_lead
            ):
                await self._prescan(
                    s,
                    rt,
                    now,
                )
            else:
                self._set(
                    s,
                    "waiting",
                    "Armed — waiting for the next cycle.",
                )

        elif (
            rt.phase == "scanning"
            and seconds_to_slot <= 0
        ):
            await self._select(
                s,
                rt,
                now,
            )

    def _ranked(
        self,
        s: Strategy,
    ) -> list[Any]:
        snap = store.snapshot()
        pool = snap.instruments

        if not pool:
            return []

        strategy_module = get_strategy_module(s.rule_set)
        if strategy_module is not None and hasattr(strategy_module, "ranked_candidates"):
            mode = get_strategy_mode(s.rule_set)
            if mode == "highest_mover":
                return strategy_module.ranked_candidates(pool)

        return (
            list(reversed(pool))[:4]
            if s.coin_pick == "top_loser"
            else pool[:4]
        )

    async def _prescan(
        self,
        s: Strategy,
        rt: Runtime,
        now: datetime,
    ) -> None:
        top = self._ranked(s)

        if not top:
            self._set(
                s,
                "waiting",
                "Waiting for scanner data.",
            )
            return

        rt.candidates = [
            t.pair
            for t in top
        ]

        rt.phase = "scanning"

        label = (
            "top losers"
            if s.coin_pick
            == "top_loser"
            else "top gainers"
        )

        self.log(
            "signal",
            f"Pre-trade scan ({label}): {', '.join(f'{t.symbol} {percent_label(t.change_pct)}' for t in top)}",
            s,
        )

        detail = (
            f"Top 4 scanned — reading the {s.timeframe} Decision A/B candles at the slot."
            if get_strategy_mode(s.rule_set) == "reversal"
            else f"Top 4 scanned — reading the {s.timeframe} candle at the slot."
        )

        self._set(
            s,
            "scanning",
            detail,
        )

    async def _resolve_inr_instrument(
        self,
        pair: str,
    ) -> dict[str, Any]:
        result = self._inr_instrument(pair)
        if asyncio.iscoroutine(result):
            return await result
        if isinstance(result, dict):
            return result
        return {}

    async def _inr_instrument(
        self,
        pair: str,
    ) -> dict[str, Any]:
        if pair in self._inr_detail:
            return self._inr_detail[pair]

        if not self._inr_pairs:
            try:
                self._inr_pairs = set(
                    await trade.inr_instruments()
                )
            except Exception:
                self._inr_pairs = set()

        if (
            self._inr_pairs
            and pair not in self._inr_pairs
        ):
            self._inr_detail[pair] = {}
            return {}

        try:
            detail = await trade.instrument_detail(
                pair,
                "INR",
            )
        except Exception:
            detail = {}

        if not isinstance(
            detail,
            dict,
        ):
            detail = {}

        self._inr_detail[pair] = detail

        return detail

    async def _select(
        self,
        s: Strategy,
        rt: Runtime,
        now: datetime,
    ) -> None:
        mode = get_strategy_mode(s.rule_set)
        if mode == "reversal":
            await self._select_reversal_candidate(
                s,
                rt,
                now,
            )
            return
        if mode == "highest_mover":
            await self._select_highest_mover(
                s,
                rt,
                now,
            )
            return

        picks: list[
            tuple[
                float,
                str,
                str,
                float,
            ]
        ] = []

        for pair in rt.candidates:
            try:
                series = await candle_api.get_candles(
                    pair,
                    s.timeframe,
                    4,
                )

            except Exception as exc:
                self.log(
                    "error",
                    f"{s.timeframe} candle fetch failed for {pair}: {exc}",
                    s,
                )
                continue

            if len(series) < 2:
                continue

            closed = series[-2]
            side = candle_side(
                closed
            )

            if side is None:
                self.log(
                    "signal",
                    f"{pair}: {s.timeframe} candle closed flat — skipped.",
                    s,
                )
                continue

            if not await self._resolve_inr_instrument(
                pair
            ):
                self.log(
                    "signal",
                    f"{pair}: not tradable on INR margin (CoinDCX returns no instrument) — skipped.",
                    s,
                )
                continue

            ticker = store.tickers.get(
                pair
            )

            change = (
                float(
                    ticker.change_pct
                    or 0.0
                )
                if ticker
                else 0.0
            )

            colour = (
                "GREEN"
                if side == "buy"
                else "RED"
            )

            self.log(
                "signal",
                f"{pair}: {s.timeframe} candle closed {colour} @ {closed['close']} → "
                f"{'BUY' if side == 'buy' else 'SELL'} candidate ({percent_label(change)} 24h).",
                s,
            )

            picks.append(
                (
                    abs(change),
                    pair,
                    side,
                    float(
                        closed["close"]
                    ),
                )
            )

        if not picks:
            rt.phase = "waiting"
            rt.slot = None

            self._set(
                s,
                "waiting",
                "No tradable candle at this slot — waiting for the next one.",
            )

            self.log(
                "info",
                "No candidate produced a clear, INR-tradable candle this slot.",
                s,
            )

            return

        picks.sort(
            reverse=True
        )

        _, pair, side, close = picks[0]

        rt.pair = pair
        rt.side = side

        self.log(
            "signal",
            f"Selected {pair} ({'BUY' if side == 'buy' else 'SELL'}) — strongest mover of the scan; "
            f"placing a limit order at the candle close {close}.",
            s,
        )

        await self._place(
            s,
            rt,
            Decimal(str(close)),
        )

    async def _select_highest_mover(
        self,
        s: Strategy,
        rt: Runtime,
        now: datetime,
    ) -> None:
        candidates: list[
            tuple[
                float,
                float,
                str,
                float,
            ]
        ] = []

        for pair in rt.candidates:
            ticker = store.tickers.get(
                pair
            )

            change = (
                float(
                    ticker.change_pct
                    or 0.0
                )
                if ticker
                else 0.0
            )

            if change <= 0:
                continue

            try:
                series = await candle_api.get_candles(
                    pair,
                    s.timeframe,
                    3,
                )

            except Exception as exc:
                self.log(
                    "error",
                    f"{s.timeframe} candle fetch failed for {pair}: {exc}",
                    s,
                )
                continue

            closed = series[:-1]

            if (
                not closed
                or not await self._resolve_inr_instrument(
                    pair
                )
            ):
                continue

            candle = closed[-1]

            volume = float(
                getattr(
                    ticker,
                    "volume_24h",
                    None,
                )
                or getattr(
                    ticker,
                    "quote_volume",
                    None,
                )
                or getattr(
                    ticker,
                    "volume",
                    None,
                )
                or 0.0
            )

            candidates.append(
                (
                    float(change),
                    volume,
                    pair,
                    float(
                        candle["close"]
                    ),
                )
            )

            self.log(
                "signal",
                f"{pair}: positive mover {percent_label(change)} — {s.timeframe} candle close {candle['close']}.",
                s,
            )

        if not candidates:
            rt.phase = "waiting"
            rt.slot = None

            self._set(
                s,
                "waiting",
                "No positive INR-tradable mover found — waiting for the next cycle.",
            )

            return

        candidates.sort(
            key=lambda c: (
                -c[0],
                -c[1],
                c[2],
            )
        )

        change, volume, pair, close = (
            candidates[0]
        )

        rt.pair = pair
        rt.side = "sell"

        self.log(
            "signal",
            f"Highest positive mover locked: {pair} ({percent_label(change)}) — SELL at candle close {close}.",
            s,
        )

        await self._place(
            s,
            rt,
            Decimal(str(close)),
        )

    async def _select_reversal_candidate(
        self,
        s: Strategy,
        rt: Runtime,
        now: datetime,
    ) -> None:
        tf = s.timeframe

        tf_minutes = strategy_runtime_config(s.rule_set).get("TF_MINUTES", {}).get(
            tf,
            60,
        )

        expected_boundary = (
            current_slot_boundary(
                now,
                tf_minutes,
            )
        )

        max_wait_seconds = 60
        poll_interval = 3

        fresh_closed: dict[
            str,
            list[dict[str, Any]],
        ] = {}

        pending = list(
            rt.candidates[:4]
        )

        waited = 0.0

        while pending:
            still_pending: list[str] = []
            poll_now = now_ist()

            for pair in pending:
                try:
                    series = await candle_api.get_candles(
                        pair,
                        tf,
                        4,
                    )

                except Exception as exc:
                    self.log(
                        "error",
                        f"{tf} candle fetch failed for {pair}: {exc}",
                        s,
                    )

                    still_pending.append(pair)
                    continue

                series = sorted(
                    series,
                    key=lambda c: float(
                        c["time"]
                    ),
                )

                closed = [
                    c
                    for c in series
                    if candle_is_closed(
                        c,
                        tf_minutes,
                        poll_now,
                    )
                ]

                if len(closed) < 2:
                    still_pending.append(pair)
                    continue

                cn2 = closed[-1]

                timestamp = float(
                    cn2["time"]
                )

                if timestamp > 10_000_000_000:
                    timestamp /= 1000

                cn2_close_at = (
                    datetime.fromtimestamp(
                        timestamp,
                        IST,
                    )
                    + timedelta(
                        minutes=tf_minutes
                    )
                )

                if (
                    cn2_close_at
                    < expected_boundary
                ):
                    still_pending.append(pair)
                    continue

                fresh_closed[pair] = closed

            pending = still_pending

            if not pending:
                break

            if (
                waited
                >= max_wait_seconds
            ):
                for pair in pending:
                    self.log(
                        "signal",
                        f"{pair}: fresh {expected_boundary.strftime('%H:%M')} candle never arrived "
                        f"after {int(max_wait_seconds)}s — skipped this cycle.",
                        s,
                    )

                break

            pending_text = ", ".join(pending)
            self.log(
                "signal",
                f"Waiting for the {expected_boundary.strftime('%H:%M')} candle to close on: {pending_text} ({int(waited)}s waited).",
                s,
            )

            await asyncio.sleep(
                poll_interval
            )

            waited += poll_interval

        now = now_ist()

        candidates: list[
            tuple[
                float,
                str,
                float,
                str,
                str,
            ]
        ] = []

        for pair, closed in fresh_closed.items():
            candle_1 = closed[-2]
            candle_2 = closed[-1]

            cn1 = float(
                candle_1["close"]
            )

            cn2 = float(
                candle_2["close"]
            )

            cn1_side = candle_side(
                candle_1
            )

            cn2_side = candle_side(
                candle_2
            )

            cn1_label = (
                "green"
                if cn1_side == "buy"
                else "red"
                if cn1_side == "sell"
                else "flat"
            )

            cn2_label = (
                "green"
                if cn2_side == "buy"
                else "red"
                if cn2_side == "sell"
                else "flat"
            )

            ticker = store.tickers.get(
                pair
            )

            change = (
                float(
                    ticker.change_pct
                    or 0.0
                )
                if ticker
                else 0.0
            )

            self.log(
                "signal",
                f"{pair}: Candle 1 (CN1) - closing price {cn1} - close time "
                f"({candle_close_label(candle_1, tf_minutes)}) - {cn1_label.upper()}, "
                f"Candle 2 (CN2) - closing price {cn2} - close time "
                f"({candle_close_label(candle_2, tf_minutes)}) - {cn2_label.upper()} "
                f"({percent_label(change)} 24h).",
                s,
            )

            if not (
                cn1_side == "buy"
                and cn2_side == "sell"
            ):
                self.log(
                    "signal",
                    f"{pair}: {cn1_label.upper()} → {cn2_label.upper()} — ELIMINATED "
                    "(only GREEN → RED qualifies).",
                    s,
                )

                continue

            if not await self._resolve_inr_instrument(
                pair
            ):
                self.log(
                    "signal",
                    f"{pair}: GREEN → RED confirmed but not tradable on INR margin — ELIMINATED.",
                    s,
                )

                continue

            candidates.append(
                (
                    abs(change),
                    pair,
                    cn2,
                    candle_close_label(
                        candle_1,
                        tf_minutes,
                    ),
                    candle_close_label(
                        candle_2,
                        tf_minutes,
                    ),
                )
            )

        if not candidates:
            rt.phase = "waiting"
            rt.slot = None

            self._set(
                s,
                "waiting",
                f"No Top-4 coin matched Green {tf} → Red {tf}.",
            )

            return

        (
            _,
            pair,
            _close,
            green_time,
            red_time,
        ) = max(candidates)

        rt.pair = pair
        rt.side = "sell"

        trigger_tf = strategy_runtime_config(s.rule_set).get("TRIGGER_TF", {}).get(
            tf,
            "1m",
        )

        self.log(
            "signal",
            f"Condition Match - Green ({green_time}) - Red ({red_time}) - "
            f"Selected for trade: {pair}; starting {trigger_tf} trigger scan.",
            s,
        )

        rt.trigger_deadline = (
            next_slot(
                now,
                tf,
                rule_set=s.rule_set,
            )
            - timedelta(minutes=2)
        )

        rt.seen_green_trigger = False
        rt.last_trigger_candle = None
        rt.phase = "trigger_wait"

        self._set(
            s,
            "trigger_wait",
            f"{pair}: fetching {trigger_tf} OHLC — wait for Green then Red close.",
        )

    async def _await_reversal_trigger(
        self,
        s: Strategy,
        rt: Runtime,
        now: datetime,
    ) -> None:
        if not rt.pair:
            self._reset(
                s,
                rt,
            )
            return

        trigger_tf = strategy_runtime_config(s.rule_set).get("TRIGGER_TF", {}).get(
            s.timeframe,
            "1m",
        )

        if (
            rt.trigger_deadline
            and now >= rt.trigger_deadline
        ):
            self.log(
                "info",
                f"Reversal trigger timeout for {rt.pair} — resetting for the next {s.timeframe} slot.",
                s,
            )

            self._reset(
                s,
                rt,
            )

            self._set(
                s,
                "waiting",
                "Reversal trigger timed out — waiting for the next slot.",
            )

            return

        try:
            series = await candle_api.get_candles(
                rt.pair,
                trigger_tf,
                3,
            )

        except Exception as exc:
            self.log(
                "error",
                f"{trigger_tf} trigger fetch failed for {rt.pair}: {exc}",
                s,
            )
            return

        if len(series) < 2:
            return

        candle = series[-2]

        candle_id = str(
            candle.get("time")
            or candle.get("timestamp")
            or candle.get("open_time")
            or candle
        )

        if (
            candle_id
            == rt.last_trigger_candle
        ):
            return

        rt.last_trigger_candle = candle_id

        timestamp = float(
            candle["time"]
        )

        if timestamp > 10_000_000_000:
            timestamp /= 1000

        candle_open = datetime.fromtimestamp(
            timestamp,
            IST,
        )

        if (
            rt.slot
            and candle_open < rt.slot
        ):
            return

        direction = candle_side(
            candle
        )

        colour = (
            "GREEN"
            if direction == "buy"
            else "RED"
            if direction == "sell"
            else "FLAT"
        )

        if (
            not rt.seen_green_trigger
            and direction == "buy"
        ):
            action = (
                "Green candle accepted — "
                "starting sequence, waiting for Red"
            )

        elif not rt.seen_green_trigger:
            action = (
                "ignored — waiting for a Green "
                "candle to start the sequence"
            )

        else:
            action = (
                "checking for confirming Red close"
            )

        self.log(
            "signal",
            f"Fetching ({trigger_tf}) {candle['time']} - OHLC "
            f"{candle['open']}/{candle['high']}/"
            f"{candle['low']}/{candle['close']} - "
            f"{colour} ({action}).",
            s,
        )

        if direction == "buy":
            rt.seen_green_trigger = True

            self._set(
                s,
                "trigger_wait",
                f"{rt.pair}: Green {trigger_tf} candle closed — waiting for Red close.",
            )

        elif (
            direction == "sell"
            and rt.seen_green_trigger
        ):
            self.log(
                "signal",
                f"{rt.pair}: ({trigger_tf}) {candle['time']} - OHLC "
                f"{candle['open']}/{candle['high']}/"
                f"{candle['low']}/{candle['close']} - RED (Entry Punch Confirmed).",
                s,
            )

            self.log(
                "signal",
                f"{rt.pair}: Red {trigger_tf} candle closed — executing SELL at {candle['close']}.",
                s,
            )

            await self._place(
                s,
                rt,
                Decimal(
                    str(candle["close"])
                ),
            )

        else:
            self._set(
                s,
                "trigger_wait",
                f"{rt.pair}: waiting for Green then Red {trigger_tf} close.",
            )

    def _pair_is_linking(
        self,
        pair: str,
        exclude_strategy_id: str | None = None,
    ) -> bool:
        if not pair:
            return False

        for sid, other_rt in self.runtime.items():
            if exclude_strategy_id is not None and sid == exclude_strategy_id:
                continue

            if other_rt.phase == "linking_position" and other_rt.pair == pair:
                return True

        return False

    async def _place(
        self,
        s: Strategy,
        rt: Runtime,
        price: Decimal,
    ) -> None:
        pair = rt.pair or ""
        side = rt.side or "sell"

        if self._pair_is_linking(pair, exclude_strategy_id=s.id):
            self.log(
                "signal",
                f"{pair} skipped — another strategy is still confirming a position on this pair.",
                s,
            )

            rt.phase = "waiting"
            rt.slot = None
            rt.pair = None

            self._set(
                s,
                "waiting",
                f"{pair} has an unresolved position link in progress — waiting for the next slot.",
            )

            return

        if not self._inr_pairs:
            try:
                self._inr_pairs = set(
                    await trade.inr_instruments()
                )
            except Exception as exc:
                self.log(
                    "error",
                    f"INR instrument list unavailable: {exc}",
                    s,
                )

        if (
            self._inr_pairs
            and pair not in self._inr_pairs
        ):
            self.log(
                "error",
                f"{pair} is not tradable with INR margin — slot skipped.",
                s,
            )

            rt.phase = "waiting"
            rt.slot = None
            rt.pair = None

            self._set(
                s,
                "waiting",
                "Selected coin has no INR-margin contract — waiting for the next slot.",
            )

            return

        capital = Decimal(
            str(
                max(
                    0,
                    s.capital_cap_inr,
                )
            )
        )

        leverage = s.leverage

        if trade.live_enabled():
            try:
                wallet_balance = (
                    await trade.inr_wallet_balance()
                )

            except Exception as exc:
                self.log(
                    "error",
                    f"INR wallet balance unavailable: {exc}",
                    s,
                )

                self._reset(
                    s,
                    rt,
                )

                self._set(
                    s,
                    "error",
                    "Wallet balance unavailable — trade skipped.",
                )

                return

            free_capital = (
                wallet_balance
                * FEE_SAFETY_BUFFER
            )

            conservative_capital = (
                live_capital_limit(
                    capital,
                    wallet_balance,
                )
            )

            mode = get_strategy_mode(s.rule_set)
            capital = (
                conservative_capital
                if mode == "highest_mover"
                else min(
                    capital,
                    conservative_capital,
                )
            )

            if (
                capital
                < LIVE_MARGIN_MINIMUM
            ):
                self.log(
                    "error",
                    f"{pair} skipped live order: usable INR futures margin is too low for a safe entry "
                    f"(wallet {wallet_balance} INR, safe cap {conservative_capital} INR, minimum {LIVE_MARGIN_MINIMUM} INR).",
                    s,
                )

                self._reset(
                    s,
                    rt,
                )

                self._set(
                    s,
                    "waiting",
                    "Live wallet margin is too low for a safe trade — waiting for the next slot.",
                )

                return

            if free_capital <= 0:
                self.log(
                    "error",
                    f"{pair} skipped live order: free INR futures margin is zero or negative.",
                    s,
                )

                self._reset(
                    s,
                    rt,
                )

                self._set(
                    s,
                    "waiting",
                    "Free futures margin is zero — waiting for the next slot.",
                )

                return

        quantity = Decimal(0)
        instrument: dict[str, Any] = {}

        try:
            instrument = (
                await self._resolve_inr_instrument(
                    pair
                )
            )

            if instrument:
                price = trade.round_price(
                    price,
                    instrument,
                )

            rate = await trade.usdt_inr_rate()

            if instrument:
                leverage = trade.max_leverage_for(
                    instrument,
                    leverage,
                )

                quantity = trade.order_quantity(
                    capital,
                    price,
                    instrument,
                    leverage,
                    rate,
                )

        except Exception as exc:
            self.log(
                "error",
                f"Instrument sizing failed for {pair}: {exc}",
                s,
            )

        if (
            trade.live_enabled()
            and (
                not instrument
                or quantity <= 0
            )
        ):
            self.log(
                "error",
                f"{pair} has no usable INR-margin contract (no instrument detail or zero "
                "quantity) — slot skipped instead of sending a doomed order.",
                s,
            )

            self._reset(
                s,
                rt,
            )

            self._set(
                s,
                "waiting",
                "Coin not tradable on INR margin — waiting for the next slot.",
            )

            return

        entry = float(price)

        tp_pct = s.tp_pct
        sl_pct = s.sl_pct

        # IMPORTANT:
        # sl_pct = 0 means user intentionally wants NO SL.
        # sl_pct = None also means NO SL.
        # Only a positive sl_pct creates an SL.
        tp, sl = tp_sl_for(
            side,
            entry,
            tp_pct,
            sl_pct,
        )

        market_entry = (
            s.order_type == "market"
        )

        if trade.live_enabled():
            try:
                if capital <= 0:
                    raise trade.CoinDcxError(
                        "INR futures wallet has no free margin"
                    )

                rt.client_order_id = f"scalp-{s.id[:8]}-{uuid.uuid4().hex[:16]}"
                order = await self.order_service.submit(
                    market_entry,
                    pair,
                    side,
                    quantity,
                    leverage,
                    price,
                    rt.client_order_id,
                )

                rt.order_id = str(
                    (order or {}).get(
                        "id"
                    )
                    or ""
                )

                if market_entry:
                    rt.position_id = str(
                        (order or {}).get(
                            "position_id"
                        )
                        or ""
                    )

                    if not rt.position_id:
                        position = (
                            await trade.find_open_position(
                                pair,
                                side,
                            )
                        )

                        rt.position_id = str(
                            (position or {}).get(
                                "id"
                            )
                            or (
                                position or {}
                            ).get(
                                "position_id"
                            )
                            or ""
                        )

                    if not rt.position_id:
                        # Same pattern as limit fill — don't reset, reconcile in background.
                        avg_price = float(
                            (order or {}).get("avg_execution_price")
                            or (order or {}).get("average_price")
                            or entry
                            or 0
                        )
                        rt.phase = "linking_position"
                        rt.pending_avg_price = avg_price
                        rt.pending_filled_qty = float(quantity)
                        rt.link_deadline = now_ist() + timedelta(seconds=LINK_TIMEOUT_SECONDS)
                        rt.last_link_check = 0.0

                        self.log(
                            "error",
                            f"LIVE market order on {pair} has no unique position ID yet — "
                            f"retrying in the background for up to {LINK_TIMEOUT_SECONDS}s before giving up.",
                            s,
                        )

                        self._set(
                            s,
                            "linking_position",
                            f"{pair}: market order filled — waiting to confirm the exchange position ID.",
                        )

                        return

                order_kind = (
                    "market"
                    if market_entry
                    else "limit"
                )

                self.log(
                    "trade",
                    f"LIVE {side.upper()} {order_kind} order placed on {pair} @ {entry} ({leverage}x).",
                    s,
                )

            except Exception as exc:
                hint = ""

                if "404" in str(exc):
                    hint = (
                        " — a 404 here usually means this pair is not enabled for INR margin, "
                        "or the API key lacks futures-trading permission"
                    )

                self.log(
                    "error",
                    f"LIVE {('market' if market_entry else 'limit')} order rejected after retries: {exc}{hint}",
                    s,
                )

                self._reset(
                    s,
                    rt,
                )

                self._set(
                    s,
                    "error",
                    f"Order rejected: {exc}",
                )

                return

        else:
            order_kind = (
                "market"
                if market_entry
                else "limit"
            )

            self.log(
                "trade",
                f"PAPER {side.upper()} {order_kind} order on {pair} @ {entry} · qty "
                f"{quantity or 'n/a'} · {leverage}x.",
                s,
            )

        record = Trade(
            id=str(uuid.uuid4()),
            strategy_id=s.id,
            strategy_name=s.name,
            pair=pair,
            side=side,
            mode=trade.mode(),
            timeframe=s.timeframe,
            entry_price=entry,
            tp_price=tp,
            sl_price=sl,
            quantity=float(quantity),
            leverage=leverage,
            capital_inr=float(capital),
            status=(
                "open"
                if market_entry
                else "pending"
            ),
            opened_at=now_ist().isoformat(
                timespec="seconds"
            ),
        )

        payload = record.model_dump()

        payload["order_id"] = (
            rt.order_id
        )

        payload["client_order_id"] = (
            rt.client_order_id
        )

        payload["position_id"] = (
            rt.position_id
        )

        await self._insert_trade(
            payload
        )

        rt.trade_id = record.id
        rt.entry = entry
        rt.tp = tp
        rt.sl = sl
        rt.quantity = float(
            quantity
        )
        rt.leverage = leverage
        rt.capital = float(
            capital
        )

        rt.phase = (
            "in_position"
            if market_entry
            else "pending_order"
        )

        rt.order_deadline = (
            None
            if market_entry
            else now_ist()
            + timedelta(
                seconds=order_window(
                    s.timeframe
                )
            )
        )

        rt.last_order_check = 0.0

        s.open_pair = pair
        s.open_side = side
        s.entry_price = entry
        s.tp_price = tp
        s.sl_price = sl

        window = order_window(
            s.timeframe
        )

        if market_entry:
            rt.trades_today += 1
            s.trades_today = (
                rt.trades_today
            )

            asyncio.create_task(
                self._save(s)
            )

            await self._mark_open(
                rt
            )

            self.log(
                "trade",
                f"{side.upper()} MARKET FILLED on {pair} @ {entry:.8f} — position live.",
                s,
            )

            self._set(
                s,
                "in_position",
                f"{side.upper()} market position open on {pair} — TP {price_label(tp)}, SL {price_label(sl)}.",
            )

            return

        self.log(
            "trade",
            f"{side.upper()} limit {pair} @ {entry:.8f} · "
            f"TP {tp:.8f} ({s.tp_pct}%) · "
            f"SL {price_label(sl)} ({s.sl_pct}%) · "
            f"{leverage}x · ₹{float(capital):,.0f} · "
            f"fill window {window}s · {trade.mode()}",
            s,
        )

        self._set(
            s,
            "pending_order",
            f"{side.upper()} limit on {pair} @ {entry:.8f} — waiting for a fill.",
        )

    async def _order_snapshot(
        self,
        s: Strategy,
        rt: Runtime,
    ) -> dict[str, Any] | None:
        if not (
            trade.live_enabled()
            and rt.order_id
        ):
            return None

        loop_now = (
            asyncio.get_event_loop().time()
        )

        if (
            loop_now
            - rt.last_order_check
            < 5
        ):
            return None

        rt.last_order_check = loop_now

        try:
            return await trade.order_status(
                rt.order_id
            )

        except Exception as exc:
            self.log(
                "error",
                f"Order status check failed: {exc}",
                s,
            )

            return None

    async def _is_filled(
        self,
        s: Strategy | None,
        rt: Runtime,
    ) -> bool:
        if (
            trade.live_enabled()
            and rt.order_id
        ):
            loop_now = (
                asyncio.get_running_loop().time()
            )

            if (
                loop_now
                - rt.last_order_check
                < 5
            ):
                return False

            rt.last_order_check = loop_now

            try:
                status = (
                    await trade.order_status(
                        rt.order_id
                    )
                    or {}
                )

            except Exception as exc:
                if s is not None:
                    self.log(
                        "error",
                        f"Order status check failed: {exc}",
                        s,
                    )

                return False

            state = str(
                status.get("status")
                or ""
            ).lower()

            if state in (
                "filled",
                "closed",
            ):
                rt.position_id = str(
                    status.get(
                        "position_id"
                    )
                    or rt.position_id
                    or ""
                )

                return True

            if state == "partially_filled":
                rt.position_id = str(
                    status.get(
                        "position_id"
                    )
                    or rt.position_id
                    or ""
                )

                return (
                    filled_quantity(
                        status,
                        0.0,
                    )
                    > 0
                )

            return False

        ticker = store.tickers.get(
            rt.pair or ""
        )

        if (
            ticker is None
            or rt.entry is None
        ):
            return False

        entry = rt.entry

        touched = (
            ticker.last <= entry
            if (
                rt.side or "sell"
            ) == "buy"
            else ticker.last >= entry
        )

        return bool(touched)

    async def _on_filled(
        self,
        s: Strategy,
        rt: Runtime,
        avg_price: float,
        filled_qty: float,
    ) -> None:
        if trade.live_enabled() and not rt.position_id:
            position = await trade.find_open_position(
                rt.pair or "",
                rt.side or "sell",
            )

            rt.position_id = str(
                (position or {}).get("id")
                or (position or {}).get("position_id")
                or ""
            )

            if not rt.position_id:
                rt.phase = "linking_position"
                rt.pending_avg_price = avg_price
                rt.pending_filled_qty = filled_qty
                rt.link_deadline = now_ist() + timedelta(seconds=LINK_TIMEOUT_SECONDS)
                rt.last_link_check = 0.0

                self.log(
                    "error",
                    f"LIVE fill on {rt.pair} has no unique position ID yet — retrying in the background for up to {LINK_TIMEOUT_SECONDS}s before giving up.",
                    s,
                )

                self._set(
                    s,
                    "linking_position",
                    f"{rt.pair}: fill confirmed — waiting to confirm the exchange position ID.",
                )

                return

        await self._finish_fill(s, rt, avg_price, filled_qty)

    async def _finish_fill(
        self,
        s: Strategy,
        rt: Runtime,
        avg_price: float,
        filled_qty: float,
    ) -> None:
        rt.phase = "in_position"

        rt.trades_today += 1
        s.trades_today = rt.trades_today
        asyncio.create_task(self._save(s))

        if avg_price:
            rt.entry = avg_price
            side = rt.side or "sell"
            tp_pct = s.tp_pct
            sl_pct = s.sl_pct
            rt.tp, rt.sl = tp_sl_for(side, rt.entry, tp_pct, sl_pct)

        if filled_qty and rt.quantity:
            rt.capital = rt.capital * min(filled_qty / rt.quantity, 1.0)
            rt.quantity = filled_qty

        if trade.live_enabled() and rt.pair:
            try:
                instrument = await self._resolve_inr_instrument(rt.pair)
                if instrument:
                    if rt.tp is not None:
                        rt.tp = float(trade.round_price(Decimal(str(rt.tp)), instrument))
                    if rt.sl is not None:
                        rt.sl = float(trade.round_price(Decimal(str(rt.sl)), instrument))
            except Exception as exc:
                self.log("error", f"TP/SL tick rounding failed for {rt.pair}: {exc}", s)

        await self._mark_open(rt)

        if trade.live_enabled() and rt.position_id:
            try:
                await trade.attach_tpsl(
                    rt.position_id,
                    Decimal(str(rt.tp or 0)),
                    (Decimal(str(rt.sl)) if rt.sl else None),
                )
                self.log(
                    "trade",
                    f"TP/SL attached: TP {price_label(rt.tp)}, SL {price_label(rt.sl)}.",
                    s,
                )
            except Exception as exc:
                self.log("error", f"TP/SL attach failed: {exc}", s)

        side = (rt.side or "sell").upper()
        s.open_pair = rt.pair
        s.open_side = rt.side
        s.entry_price = rt.entry
        s.tp_price = rt.tp
        s.sl_price = rt.sl

        self.log(
            "trade",
            f"Limit order FILLED on {rt.pair} @ {rt.entry:.8f} — position live.",
            s,
        )

        self._set(
            s,
            "in_position",
            f"{side} open on {rt.pair} — TP {price_label(rt.tp)}, SL {price_label(rt.sl)}.",
        )

    async def _await_position_link(
        self,
        s: Strategy,
        rt: Runtime,
        now: datetime,
    ) -> None:
        if not rt.pair:
            self._reset(s, rt)
            return

        if rt.link_deadline and now >= rt.link_deadline:
            self.log(
                "error",
                f"{rt.pair}: position ID still unresolved after the reconciliation window — giving up. Position may still be open on the exchange without bot-managed TP/SL; check CoinDCX manually.",
                s,
            )

            self._reset(s, rt)
            self._set(
                s,
                "error",
                f"{rt.pair}: could not confirm the exchange position — check CoinDCX manually.",
            )
            return

        loop_now = asyncio.get_event_loop().time()
        if loop_now - rt.last_link_check < LINK_RETRY_SECONDS:
            return

        rt.last_link_check = loop_now

        try:
            position = await trade.find_open_position(rt.pair, rt.side or "sell")
        except Exception as exc:
            self.log("error", f"Position link retry failed for {rt.pair}: {exc}", s)
            return

        position_id = str(
            (position or {}).get("id")
            or (position or {}).get("position_id")
            or ""
        )

        if not position_id:
            return

        rt.position_id = position_id
        self.log(
            "trade",
            f"{rt.pair}: exchange position confirmed ({position_id}) — attaching TP/SL now.",
            s,
        )

        await self._finish_fill(s, rt, rt.pending_avg_price, rt.pending_filled_qty)

    async def _finalize_partial_fill(
        self,
        s: Strategy,
        rt: Runtime,
        avg_price: float,
        qty: float,
    ) -> None:
        if (
            trade.live_enabled()
            and rt.order_id
        ):
            try:
                await trade.cancel_order(
                    rt.order_id
                )

            except Exception as exc:
                self.log(
                    "error",
                    f"Cancelling the unfilled remainder failed: {exc}",
                    s,
                )

        if qty <= 0:
            self.log(
                "info",
                f"{rt.pair}: partial fill resolved to zero quantity — treated as unfilled.",
                s,
            )

            await self._update_trade(
                rt.trade_id,
                {
                    "status": "cancelled",
                    "closed_at": now_ist().isoformat(
                        timespec="seconds"
                    ),
                },
            )

            self._reset(
                s,
                rt,
            )

            self._set(
                s,
                "waiting",
                "Order never filled — cancelled, waiting for the next slot.",
            )

            return

        self.log(
            "trade",
            f"{rt.pair}: only {qty}/{rt.quantity} filled by the deadline — remainder "
            "cancelled, opening the position on the filled amount only.",
            s,
        )

        await self._on_filled(
            s,
            rt,
            avg_price,
            qty,
        )

    async def _cancel_unfilled(
        self,
        s: Strategy,
        rt: Runtime,
    ) -> None:
        if (
            trade.live_enabled()
            and rt.order_id
        ):
            try:
                await trade.cancel_order(
                    rt.order_id
                )

            except Exception as exc:
                self.log(
                    "error",
                    f"Order cancel failed: {exc}",
                    s,
                )

        self.log(
            "info",
            f"Limit order on {rt.pair} was not filled inside "
            f"{order_window(s.timeframe)}s — cancelled, waiting for the next slot.",
            s,
        )

        await self._update_trade(
            rt.trade_id,
            {
                "status": "cancelled",
                "closed_at": now_ist().isoformat(
                    timespec="seconds"
                ),
            },
        )

        self._reset(
            s,
            rt,
        )

        self._set(
            s,
            "waiting",
            "Order cancelled (no fill) — waiting for the next slot.",
        )

    async def _await_fill(
        self,
        s: Strategy,
        rt: Runtime,
        now: datetime,
    ) -> None:
        if not trade.live_enabled():
            if (
                rt.order_deadline
                and now >= rt.order_deadline
            ):
                ticker = store.tickers.get(
                    rt.pair or ""
                )

                if ticker is None:
                    await self._cancel_unfilled(
                        s,
                        rt,
                    )
                    return

                entry = rt.entry or 0.0
                touched = (
                    ticker.last <= entry
                    if (
                        rt.side or "sell"
                    ) == "buy"
                    else ticker.last >= entry
                )

                if touched:
                    await self._on_filled(
                        s,
                        rt,
                        entry,
                        rt.quantity,
                    )
                    return

                await self._cancel_unfilled(
                    s,
                    rt,
                )
                return

            ticker = store.tickers.get(
                rt.pair or ""
            )

            if ticker is not None:
                entry = rt.entry or 0.0

                touched = (
                    ticker.last <= entry
                    if (
                        rt.side or "sell"
                    ) == "buy"
                    else ticker.last >= entry
                )

                if touched:
                    await self._on_filled(
                        s,
                        rt,
                        entry,
                        rt.quantity,
                    )

            return

        # Deadline check.
        #
        # IMPORTANT:
        # A limit order can be fully filled exactly at the
        # deadline. In that case it MUST NOT be cancelled.
        if (
            rt.order_deadline
            and now >= rt.order_deadline
        ):
            status = (
                await self._order_snapshot(
                    s,
                    rt,
                )
                or {}
            )

            filled = filled_quantity(
                status,
                0.0,
            )

            if (
                filled > 0
                and filled < rt.quantity
            ):
                avg = float(
                    status.get(
                        "avg_execution_price"
                    )
                    or status.get(
                        "average_price"
                    )
                    or rt.entry
                    or 0
                )

                await self._finalize_partial_fill(
                    s,
                    rt,
                    avg,
                    filled,
                )

            elif filled >= rt.quantity:
                # FIX:
                # Fully filled at or before deadline.
                # Do NOT cancel the order.
                avg = float(
                    status.get(
                        "avg_execution_price"
                    )
                    or status.get(
                        "average_price"
                    )
                    or rt.entry
                    or 0
                )

                await self._on_filled(
                    s,
                    rt,
                    avg,
                    filled,
                )

            else:
                await self._cancel_unfilled(
                    s,
                    rt,
                )

            return

        if await self._is_filled(
            s,
            rt,
        ):
            status = (
                await self._order_snapshot(
                    s,
                    rt,
                )
                or {}
            )

            avg = float(
                status.get(
                    "avg_execution_price"
                )
                or status.get(
                    "average_price"
                )
                or rt.entry
                or 0
            )

            filled = filled_quantity(
                status,
                rt.quantity,
            )

            await self._on_filled(
                s,
                rt,
                avg,
                filled,
            )

    async def _monitor(
        self,
        s: Strategy,
        rt: Runtime,
    ) -> None:
        ticker = store.tickers.get(
            rt.pair or ""
        )

        if (
            ticker is None
            or rt.entry is None
        ):
            return

        entry = rt.entry
        side = rt.side or "sell"
        last = ticker.last

        if last is None:
            return

        if side == "buy":
            if (
                rt.tp is not None
                and last >= rt.tp
            ):
                await self._on_tp_sl_hit(
                    s,
                    rt,
                    "tp",
                    last,
                )
                return

            if (
                rt.sl is not None
                and last <= rt.sl
            ):
                await self._on_tp_sl_hit(
                    s,
                    rt,
                    "sl",
                    last,
                )
                return

        else:
            if (
                rt.tp is not None
                and last <= rt.tp
            ):
                await self._on_tp_sl_hit(
                    s,
                    rt,
                    "tp",
                    last,
                )
                return

            if (
                rt.sl is not None
                and last >= rt.sl
            ):
                await self._on_tp_sl_hit(
                    s,
                    rt,
                    "sl",
                    last,
                )
                return

        if (
            trade.live_enabled()
            and rt.position_id
        ):
            try:
                pos = await trade.position_status(
                    rt.position_id
                )

                if not position_is_open(
                    pos
                ):
                    self.log(
                        "trade",
                        f"{rt.pair}: position {rt.position_id} no longer open on exchange — treating as closed.",
                        s,
                    )

                    await self._close_trade(
                        s,
                        rt,
                        "closed",
                        last,
                        "Position closed externally (TP/SL/liquidation/manual).",
                    )

            except Exception as exc:
                self.log(
                    "error",
                    f"Position status check failed for {rt.position_id}: {exc}",
                    s,
                )

    async def _mark_open(
        self,
        rt: Runtime,
    ) -> None:
        await self._update_trade(
            rt.trade_id,
            {
                "status": "open",
                "order_id": rt.order_id,
                "position_id": rt.position_id,
                "entry_price": rt.entry,
                "tp_price": rt.tp,
                "sl_price": rt.sl,
                "quantity": rt.quantity,
                "leverage": rt.leverage,
                "capital_inr": rt.capital,
            },
        )

    def _reset(
        self,
        s: Strategy,
        rt: Runtime,
    ) -> None:
        rt.phase = "waiting"

        rt.pair = rt.side = rt.trade_id = rt.order_id = rt.position_id = None
        rt.entry = rt.tp = rt.sl = None
        rt.quantity = rt.leverage = rt.capital = 0.0
        rt.order_deadline = rt.trigger_deadline = rt.link_deadline = None
        rt.pending_avg_price = rt.pending_filled_qty = rt.last_link_check = 0.0
        rt.seen_green_trigger = False
        rt.last_trigger_candle = None

        s.open_pair = s.open_side = s.entry_price = s.tp_price = s.sl_price = None

        asyncio.create_task(self._save(s))

    async def _close_trade(
        self,
        s: Strategy,
        rt: Runtime,
        outcome: str,
        exit_price: float,
        reason: str,
    ) -> None:
        pnl = pnl_pct_for(
            rt.side or "sell",
            rt.entry or 0.0,
            exit_price,
            rt.leverage,
        )

        pnl_inr = (
            (rt.capital or 0.0) * pnl / 100.0
            if rt.capital and pnl is not None
            else 0.0
        )

        await self._update_trade(
            rt.trade_id,
            {
                "status": outcome,
                "exit_price": exit_price,
                "pnl_pct": pnl,
                "pnl_inr": pnl_inr,
                "closed_at": now_ist().isoformat(
                    timespec="seconds"
                ),
                "close_reason": reason,
            },
        )

        self.log(
            "trade",
            f"{rt.pair} {outcome.upper()} @ {exit_price:.8f} "
            f"({percent_label(pnl)}) — {reason}",
            s,
        )

        self._reset(
            s,
            rt,
        )

        self._set(
            s,
            "waiting",
            f"Position closed — {reason}. Waiting for the next slot.",
        )

    async def _on_tp_sl_hit(
        self,
        s: Strategy,
        rt: Runtime,
        kind: str,
        price: float,
    ) -> None:
        if (
            trade.live_enabled()
            and rt.position_id
        ):
            try:
                await trade.exit_position(
                    rt.position_id
                )

            except Exception as exc:
                self.log(
                    "error",
                    f"Exit order failed for {rt.position_id}: {exc}",
                    s,
                )

        await self._close_trade(
            s,
            rt,
            kind,
            price,
            (
                "Take profit hit."
                if kind == "tp"
                else "Stop loss hit."
            ),
        )

    async def _on_liquidation(
        self,
        s: Strategy,
        rt: Runtime,
        price: float,
    ) -> None:
        if (
            trade.live_enabled()
            and rt.position_id
        ):
            try:
                await trade.exit_position(
                    rt.position_id
                )

            except Exception as exc:
                self.log(
                    "error",
                    f"Liquidation exit failed for {rt.position_id}: {exc}",
                    s,
                )

        await self._close_trade(
            s,
            rt,
            "liquidated",
            price,
            "Position liquidated.",
        )


# One cached engine per user.
#
# IMPORTANT:
# Do NOT create a separate global:
#
#     engine = BotEngine()
#
# Routers/server should use get_engine(user_id).
_engine_cache: dict[
    str,
    BotEngine,
] = {}


def get_engine(
    user_id: str = "admin",
) -> BotEngine:
    user_id = (
        user_id.strip().lower()
        or "admin"
    )

    if user_id not in _engine_cache:
        _engine_cache[user_id] = BotEngine(
            user_id
        )

    return _engine_cache[user_id]
