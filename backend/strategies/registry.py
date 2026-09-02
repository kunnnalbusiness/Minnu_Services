from __future__ import annotations

import sys
from typing import Any

from .Strategy2 import Strategy2
from .Strategy3 import Strategy3
from .Strategy4 import Strategy4


def _strategy_namespace(strategy_cls: type[Any]) -> dict[str, Any]:
    namespace: dict[str, Any] = {}
    module = sys.modules.get(strategy_cls.__module__)
    if module is not None:
        namespace.update(vars(module))
    namespace.update(vars(strategy_cls))
    return namespace

STRATEGY_REGISTRY: dict[str, type[Any]] = {
    Strategy2.rule_set: Strategy2,
    Strategy3.rule_set: Strategy3,
    Strategy4.rule_set: Strategy4,
}


def get_strategy_module(rule_set: str | None) -> type[Any] | None:
    if not rule_set or rule_set == "legacy":
        return None
    return STRATEGY_REGISTRY.get(rule_set)


def get_strategy_mode(rule_set: str | None) -> str:
    strategy_module = get_strategy_module(rule_set)
    if strategy_module is None:
        return "default"
    namespace = _strategy_namespace(strategy_module)
    return namespace.get("selection_mode", "default")


def get_strategy_prescan_lead(rule_set: str | None) -> int:
    strategy_module = get_strategy_module(rule_set)
    if strategy_module is None:
        return 60
    namespace = _strategy_namespace(strategy_module)
    return namespace.get("PRESCAN_LEAD", 60)


def get_strategy_runtime_config(rule_set: str | None) -> dict[str, Any]:
    strategy_module = get_strategy_module(rule_set)
    if strategy_module is None:
        return {}
    namespace = _strategy_namespace(strategy_module)
    return {
        key: namespace[key]
        for key in (
            "WINDOW_START",
            "WINDOW_END",
            "TF_MINUTES",
            "ORDER_WINDOW",
            "TRIGGER_TF",
            "PRESCAN_LEAD",
            "TICK_SECONDS",
            "MAX_LOGS",
            "MAX_TRADE_HISTORY",
        )
        if key in namespace
    }


def _template_from_strategy(strategy_cls: type[Any], *, name: str | None = None) -> dict[str, Any]:
    rule_set = getattr(strategy_cls, "rule_set", "legacy")
    metadata = {
        "rule_set": rule_set,
        "name": name or getattr(strategy_cls, "name", str(rule_set)),
        "coin_pick": "top_gainer" if "gainer" in (name or "").lower() else "top_loser",
        "timeframe": "1h",
        "order_type": "market",
        "capital_cap_inr": 40000,
        "leverage": 10,
        "tp_pct": 5.0 if rule_set == "highest_mover_sell" else 1.5,
        "sl_pct": 0.0 if rule_set == "highest_mover_sell" else 1.0,
        "max_trades_per_day": 5,
        "daily_target_inr": 25000,
    }
    if rule_set == "highest_mover_sell":
        metadata["coin_pick"] = "top_gainer"
        metadata["timeframe"] = "1h"
        metadata["order_type"] = "market"
    return metadata


STRATEGY_TEMPLATES: list[dict[str, Any]] = [
    _template_from_strategy(Strategy2, name="1PERIOD CYCLE"),
    _template_from_strategy(Strategy3, name="HIGHEST MOVER SELL"),
    _template_from_strategy(Strategy4, name="1HR VOL. CONF."),
]


def get_strategy_template(rule_set: str) -> dict[str, Any] | None:
    for template in STRATEGY_TEMPLATES:
        if template["rule_set"] == rule_set:
            return template.copy()
    return None


def get_strategy_templates() -> list[dict[str, Any]]:
    return [template.copy() for template in STRATEGY_TEMPLATES]


__all__ = [
    "STRATEGY_REGISTRY",
    "STRATEGY_TEMPLATES",
    "get_strategy_module",
    "get_strategy_mode",
    "get_strategy_prescan_lead",
    "get_strategy_runtime_config",
    "get_strategy_template",
    "get_strategy_templates",
]
