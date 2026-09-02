"""CoinDCX candlestick fetching with a short-lived in-process cache."""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from lib.clock import exchange_time
from lib.config import CANDLES_URL, CANDLE_CACHE_TTL

# resolution -> seconds per candle
RESOLUTIONS: dict[str, int] = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "2h": 7200,
    "4h": 14400,
    "1d": 86400,
    "1w": 604800,
    "1M": 2592000,
}

CACHE_TTL = float(CANDLE_CACHE_TTL)
_cache: dict[tuple[str, str], tuple[float, list[dict[str, Any]]]] = {}
_lock = asyncio.Lock()


def _normalise(rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    out = [
        {
            "time": int(r["time"]),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": float(r.get("volume") or 0),
        }
        for r in rows
        if r.get("time") is not None
    ]
    out.sort(key=lambda c: c["time"])
    return out[-limit:]


def _merge_pairs(candles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aggregate consecutive candles two-at-a-time (used to synthesise 2h from 1h)."""
    merged: list[dict[str, Any]] = []
    for i in range(0, len(candles) - 1, 2):
        a, b = candles[i], candles[i + 1]
        merged.append(
            {
                "time": a["time"],
                "open": a["open"],
                "high": max(a["high"], b["high"]),
                "low": min(a["low"], b["low"]),
                "close": b["close"],
                "volume": a["volume"] + b["volume"],
            }
        )
    return merged


async def _fetch(http: httpx.AsyncClient, pair: str, resolution: str, limit: int) -> list[dict[str, Any]]:
    span = RESOLUTIONS[resolution] * (limit + 5)
    now = int(exchange_time())
    res = await http.get(
        CANDLES_URL,
        params={"pair": pair, "from": now - span, "to": now, "resolution": resolution, "pcode": "f"},
    )
    res.raise_for_status()
    payload = res.json() or {}
    return _normalise(payload.get("data") or [], limit)


async def fetch_range(pair: str, resolution: str, start: int, end: int, limit: int = 200) -> list[dict[str, Any]]:
    """Fetch candles for a historical Unix-second range without touching the live cache."""
    async with httpx.AsyncClient(timeout=20) as http:
        response = await http.get(
            CANDLES_URL,
            params={"pair": pair, "from": start, "to": end, "resolution": resolution, "pcode": "f"},
        )
        response.raise_for_status()
        payload = response.json() or {}
    return _normalise(payload.get("data") or [], limit)


async def fetch_candle_at(pair: str, resolution: str, timestamp_ms: int) -> dict[str, Any] | None:
    """Return the first candle at or immediately after a Unix-millisecond timestamp."""
    rows = await fetch_range(pair, resolution, timestamp_ms // 1000, timestamp_ms // 1000 + 60, 1)
    return rows[0] if rows else None


async def get_candles(pair: str, resolution: str, limit: int = 60) -> list[dict[str, Any]]:
    key = (pair, resolution)
    cached = _cache.get(key)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1]

    async with _lock:
        cached = _cache.get(key)
        if cached and time.time() - cached[0] < CACHE_TTL:
            return cached[1]
        async with httpx.AsyncClient(timeout=15) as http:
            candles = await _fetch(http, pair, resolution, limit)
            # CoinDCX has no native 2h series — build it from 1h candles.
            if not candles and resolution == "2h":
                hourly = await _fetch(http, pair, "1h", limit * 2)
                candles = _merge_pairs(hourly)[-limit:]
        _cache[key] = (time.time(), candles)
        return candles
