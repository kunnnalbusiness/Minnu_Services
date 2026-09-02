"""In-memory live market store: polls the CoinDCX futures stream and fans out to clients."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time

import httpx

from lib import coindcx
from lib.config import COINDCX_WS_PRICE_CHANNEL, COINDCX_WS_URL, MARKET_PRICE_EVENT, MARKET_TOP_N
from models.market import Snapshot, Ticker

logger = logging.getLogger(__name__)

TOP_N = int(MARKET_TOP_N)
SOCKET_URL = COINDCX_WS_URL
PRICE_CHANNEL = COINDCX_WS_PRICE_CHANNEL
PRICE_EVENT = MARKET_PRICE_EVENT


def _symbol(pair: str, mkt: str | None) -> str:
    if mkt:
        return str(mkt)
    return pair.split("-", 1)[-1].replace("_", "")


class MarketStore:
    def __init__(self) -> None:
        self.pairs: list[str] = []
        self.leverage: dict[str, int] = {}
        self.tickers: dict[str, Ticker] = {}
        self.ts: int = 0
        self.connected: bool = False
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._tasks: list[asyncio.Task[None]] = []

    # ---------- snapshot ----------
    def snapshot(self) -> Snapshot:
        instruments = sorted(self.tickers.values(), key=lambda t: -t.change_pct)
        return Snapshot(
            ts=self.ts or int(time.time() * 1000),
            count=len(instruments),
            connected=self.connected,
            source="coindcx-futures-stream",
            instruments=instruments,
            top=instruments[:TOP_N],
        )

    # ---------- pub/sub ----------
    def subscribe(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=2)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[str]) -> None:
        self._subscribers.discard(q)

    def _broadcast(self) -> None:
        if not self._subscribers:
            return
        payload = json.dumps(self.snapshot().model_dump())
        for q in list(self._subscribers):
            if q.full():          # slow client: drop the stale frame, keep the newest
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    # ---------- ingest ----------
    def _apply(self, ts: int, prices: dict[str, object]) -> None:
        allowed = set(self.pairs)
        for pair, raw in prices.items():
            if pair not in allowed or not isinstance(raw, dict):
                continue
            previous = self.tickers.get(pair)
            try:
                last = float(raw.get("ls") or raw.get("mp") or (previous.last if previous else 0))
                change = float(raw.get("pc") if raw.get("pc") is not None else (previous.change_pct if previous else 0))
            except (TypeError, ValueError):
                continue
            if last <= 0:
                continue
            # CoinDCX publishes the 24h change %, so the 24h open is derivable from it.
            denom = 1 + change / 100
            open_price = last / denom if denom else last
            self.tickers[pair] = Ticker(
                pair=pair,
                symbol=_symbol(pair, raw.get("mkt") if isinstance(raw.get("mkt"), str) else None),
                max_leverage=self.leverage.get(pair),
                last=last,
                open=open_price,
                high=float(raw.get("h") or (previous.high if previous else last)),
                low=float(raw.get("l") or (previous.low if previous else last)),
                change_pct=change,
                volume=float(raw.get("v") or (previous.volume if previous else 0)),
                funding_rate=float(raw.get("fr") or (previous.funding_rate if previous else 0)),
            )
        self.ts = ts or int(time.time() * 1000)

    # ---------- background loops ----------
    async def _price_loop(self) -> None:
        import socketio

        try:
            async with httpx.AsyncClient(timeout=15) as http:
                self.pairs = await coindcx.fetch_active_instruments(http)
        except Exception as exc:
            logger.warning("active instrument bootstrap failed: %s", exc)
        while True:
            client = socketio.AsyncClient(
                reconnection=True,
                reconnection_attempts=0,
                reconnection_delay=1,
                reconnection_delay_max=10,
                logger=False,
                engineio_logger=False,
            )

            @client.event
            async def connect() -> None:
                self.connected = True
                await client.emit("join", {"channelName": PRICE_CHANNEL})
                logger.info("CoinDCX futures price stream connected")

            @client.on(PRICE_EVENT)
            async def price_update(payload: object) -> None:
                if not isinstance(payload, dict):
                    return
                data = payload.get("data")
                if isinstance(data, str):
                    try:
                        data = json.loads(data)
                    except json.JSONDecodeError:
                        return
                if isinstance(data, dict):
                    payload = data
                prices = payload.get("prices")
                if not isinstance(prices, dict):
                    return
                raw_ts = payload.get("ts") or payload.get("T") or int(time.time() * 1000)
                try:
                    ts = int(raw_ts)
                except (TypeError, ValueError):
                    ts = int(time.time() * 1000)
                self._apply(ts, prices)
                self.connected = True
                self._broadcast()

            @client.event
            async def disconnect() -> None:
                self.connected = False
                logger.warning("CoinDCX futures price stream disconnected")

            try:
                await client.connect(SOCKET_URL, transports=["websocket"])
                await client.wait()
            except asyncio.CancelledError:
                await client.disconnect()
                raise
            except Exception as exc:
                self.connected = False
                logger.warning("market WebSocket failed: %s", exc)
                await asyncio.sleep(2)
            finally:
                if client.connected:
                    await client.disconnect()

    async def _leverage_loop(self) -> None:
        try:
            self.leverage = await coindcx.load_cached_leverage()
        except Exception as exc:
            logger.warning("leverage cache read failed: %s", exc)
        async with httpx.AsyncClient(timeout=20) as http:
            while True:
                try:
                    if not self.pairs:
                        self.pairs = await coindcx.fetch_active_instruments(http)
                    missing = [p for p in self.pairs if p not in self.leverage]
                    if missing:
                        fetched = await coindcx.fetch_leverage(http, missing[:150])
                        self.leverage.update(fetched)
                        for pair, lev in fetched.items():
                            if pair in self.tickers:
                                self.tickers[pair].max_leverage = lev
                except Exception as exc:
                    logger.warning("leverage refresh failed: %s", exc)
                await asyncio.sleep(20)

    def start(self) -> None:
        self._tasks = [
            asyncio.create_task(self._price_loop()),
            asyncio.create_task(self._leverage_loop()),
        ]

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass


store = MarketStore()
