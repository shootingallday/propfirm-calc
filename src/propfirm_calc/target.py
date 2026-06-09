"""Profit-target progress and payout eligibility.

``payout_eligibility`` combines the target, minimum-winning-days, and
consistency checks into a single answer plus human-readable blockers. Pass
only the constraints your firm imposes; anything left as ``None`` is skipped.
"""

from __future__ import annotations

from dataclasses import dataclass

from .consistency import best_day_pct, consistency_ok, required_profit


def target_remaining(current_profit: float, profit_target: float) -> float:
    """Dollars still needed to reach the profit target (never negative)."""
    return max(0.0, profit_target - current_profit)


def target_reached(current_profit: float, profit_target: float) -> bool:
    """True once cumulative profit meets or exceeds the target."""
    return current_profit >= profit_target


@dataclass(frozen=True)
class EligibilityResult:
    """Outcome of :func:`payout_eligibility`.

    ``*_met`` fields are ``None`` when that check was not requested.
    """

    eligible: bool
    blockers: tuple[str, ...]
    target_met: bool | None = None
    days_met: bool | None = None
    consistency_met: bool | None = None
    profit_remaining: float | None = None
    consistency_required_profit: float | None = None


def payout_eligibility(
    current_profit: float,
    *,
    profit_target: float | None = None,
    winning_days: int | None = None,
    min_winning_days: int | None = None,
    best_day_profit: float | None = None,
    consistency_pct: float | None = None,
) -> EligibilityResult:
    """Evaluate whether a funded account currently qualifies for a payout.

    Only the constraints you supply are enforced. The result is ``eligible``
    when no blockers remain.

    Args:
        current_profit: Cumulative net profit on the account.
        profit_target: Profit target to clear, if the firm sets one.
        winning_days / min_winning_days: Count of qualifying winning days and
            the minimum required. Both must be given for the check to apply.
        best_day_profit / consistency_pct: Largest single-day profit and the
            consistency cap. Both must be given for the check to apply.
    """
    blockers: list[str] = []

    target_met: bool | None = None
    profit_remaining: float | None = None
    if profit_target is not None:
        target_met = target_reached(current_profit, profit_target)
        profit_remaining = target_remaining(current_profit, profit_target)
        if not target_met:
            blockers.append(
                f"Profit ${current_profit:,.0f} below target ${profit_target:,.0f} "
                f"(${profit_remaining:,.0f} to go)"
            )

    days_met: bool | None = None
    if winning_days is not None and min_winning_days is not None:
        days_met = winning_days >= min_winning_days
        if not days_met:
            blockers.append(
                f"{winning_days} of {min_winning_days} required winning days"
            )

    consistency_met: bool | None = None
    consistency_required_profit: float | None = None
    if best_day_profit is not None and consistency_pct is not None:
        consistency_met = consistency_ok(
            best_day_profit, current_profit, consistency_pct
        )
        consistency_required_profit = required_profit(
            best_day_profit, consistency_pct
        )
        if not consistency_met:
            pct = best_day_pct(best_day_profit, current_profit)
            shown = "∞" if pct == float("inf") else f"{pct:.0f}%"
            blockers.append(
                f"Best day {shown} over the {consistency_pct:.0f}% consistency limit"
            )

    return EligibilityResult(
        eligible=not blockers,
        blockers=tuple(blockers),
        target_met=target_met,
        days_met=days_met,
        consistency_met=consistency_met,
        profit_remaining=profit_remaining,
        consistency_required_profit=consistency_required_profit,
    )
