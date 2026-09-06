"""Consistency-rule math.

Most funded-trader firms cap how much of your *total* profit a single day may
represent — e.g. a 50% consistency rule means your best day can be at most 50%
of cumulative profit. The practical consequence traders miss: a big day raises
the *total profit you must reach* before that day becomes withdrawable.
"""

from __future__ import annotations

import math


def best_day_pct(best_day_profit: float, total_profit: float) -> float:
    """Best single day as a percentage of total profit.

    Returns ``math.inf`` when ``total_profit`` is zero or negative, since the
    consistency rule cannot be satisfied without positive total profit.
    """
    if total_profit <= 0:
        return math.inf
    return best_day_profit / total_profit * 100.0


def consistency_ok(best_day_profit: float, total_profit: float, consistency_pct: float) -> bool:
    """True if the best day is within the consistency cap.

    Requires positive total profit and ``best_day_pct <= consistency_pct``.
    """
    if total_profit <= 0:
        return False
    return best_day_pct(best_day_profit, total_profit) <= consistency_pct


def required_profit(best_day_profit: float, consistency_pct: float) -> float:
    """Minimum total profit at which ``best_day_profit`` satisfies the rule.

    A day worth ``best_day_profit`` can only ever be ``consistency_pct`` of the
    total, so it sets a floor on the profit you must reach:
    ``best_day_profit / (consistency_pct / 100)``.

    Raises:
        ValueError: If ``consistency_pct`` is not positive.
    """
    if consistency_pct <= 0:
        raise ValueError("consistency_pct must be a positive percentage")
    return best_day_profit / (consistency_pct / 100.0)
