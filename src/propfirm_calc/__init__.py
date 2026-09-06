"""propfirm-calc — tiny, dependency-free math for funded-trader (prop firm) accounts.

Drawdown floors, the consistency rule, payout eligibility, position sizing and
payout projection — the calculations every prop-futures trader needs and most
journals get subtly wrong. Bring your own numbers; this library has no opinion
about any specific firm and bundles no firm data.
"""

from __future__ import annotations

from .consistency import best_day_pct, consistency_ok, required_profit
from .drawdown import cushion, drawdown_floor, is_blown
from .projection import PayoutProjection, days_to_profit, payout_projection
from .sizing import (
    max_contracts,
    max_contracts_from_cushion,
    pnl,
    position_risk,
    r_multiple,
    ticks_to_target,
)
from .target import (
    EligibilityResult,
    payout_eligibility,
    target_reached,
    target_remaining,
)

__version__ = "0.2.0"

__all__ = [
    "EligibilityResult",
    "PayoutProjection",
    "__version__",
    "best_day_pct",
    "consistency_ok",
    "cushion",
    "days_to_profit",
    "drawdown_floor",
    "is_blown",
    "max_contracts",
    "max_contracts_from_cushion",
    "payout_eligibility",
    "payout_projection",
    "pnl",
    "position_risk",
    "r_multiple",
    "required_profit",
    "target_reached",
    "target_remaining",
    "ticks_to_target",
]
