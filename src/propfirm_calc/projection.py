"""Projecting the trading days remaining before a payout is possible.

"Am I eligible?" is :func:`~propfirm_calc.target.payout_eligibility`. This
module answers the follow-up — *when* — by running each payout constraint
forward at an assumed average daily profit and reporting the one that binds
longest. The consistency rule is the constraint that surprises people: a big
day can push the payout date out further than the profit target does.

Projections assume every future trading day is a winning day worth
``avg_daily_profit``. That is an optimistic floor on the timeline, not a
forecast.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .consistency import required_profit
from .target import target_remaining

TARGET = "profit_target"
WINNING_DAYS = "winning_days"
CONSISTENCY = "consistency"


def days_to_profit(current_profit: float, needed_profit: float, avg_daily_profit: float) -> float:
    """Whole trading days at ``avg_daily_profit`` to reach ``needed_profit``.

    Returns ``0.0`` when the level is already reached, and ``math.inf`` when
    ``avg_daily_profit`` is not positive and the level is still short.
    """
    shortfall = target_remaining(current_profit, needed_profit)
    if shortfall <= 0:
        return 0.0
    if avg_daily_profit <= 0:
        return math.inf
    return float(math.ceil(shortfall / avg_daily_profit))


@dataclass(frozen=True)
class PayoutProjection:
    """Outcome of :func:`payout_projection`.

    ``days_to_*`` fields are ``None`` when that constraint was not requested
    and ``math.inf`` when it can never be met at the given average.
    """

    trading_days: float
    binding_constraint: str | None
    projected_profit: float
    days_to_target: float | None = None
    days_to_min_days: float | None = None
    days_to_consistency: float | None = None


def payout_projection(
    current_profit: float,
    avg_daily_profit: float,
    *,
    profit_target: float | None = None,
    winning_days: int | None = None,
    min_winning_days: int | None = None,
    best_day_profit: float | None = None,
    consistency_pct: float | None = None,
) -> PayoutProjection:
    """Trading days until every supplied payout constraint is satisfied.

    Only the constraints you supply are projected, matching
    :func:`~propfirm_calc.target.payout_eligibility`.

    Args:
        current_profit: Cumulative net profit on the account.
        avg_daily_profit: Assumed profit per future trading day.
        profit_target: Profit target to clear, if the firm sets one.
        winning_days / min_winning_days: Winning days banked and the minimum
            required. Both must be given for the check to apply.
        best_day_profit / consistency_pct: Largest single-day profit and the
            consistency cap. Both must be given for the check to apply.

    Returns:
        A :class:`PayoutProjection` whose ``trading_days`` is the longest of
        the applicable constraints and whose ``binding_constraint`` names it.
        ``trading_days`` is ``0.0`` with a ``None`` constraint when a payout is
        already available.
    """
    to_target: float | None = None
    if profit_target is not None:
        to_target = days_to_profit(current_profit, profit_target, avg_daily_profit)

    to_min_days: float | None = None
    if winning_days is not None and min_winning_days is not None:
        remaining_days = max(0, min_winning_days - winning_days)
        if remaining_days == 0:
            to_min_days = 0.0
        elif avg_daily_profit <= 0:
            to_min_days = math.inf
        else:
            to_min_days = float(remaining_days)

    to_consistency: float | None = None
    if best_day_profit is not None and consistency_pct is not None:
        needed = required_profit(best_day_profit, consistency_pct)
        to_consistency = days_to_profit(current_profit, needed, avg_daily_profit)

    candidates = [
        (days, name)
        for days, name in (
            (to_target, TARGET),
            (to_min_days, WINNING_DAYS),
            (to_consistency, CONSISTENCY),
        )
        if days is not None
    ]

    trading_days = max((days for days, _ in candidates), default=0.0)
    binding = next((name for days, name in candidates if days == trading_days), None)
    if trading_days == 0:
        binding = None

    projected = (
        math.inf
        if math.isinf(trading_days)
        else current_profit + avg_daily_profit * trading_days
    )

    return PayoutProjection(
        trading_days=trading_days,
        binding_constraint=binding,
        projected_profit=projected,
        days_to_target=to_target,
        days_to_min_days=to_min_days,
        days_to_consistency=to_consistency,
    )
