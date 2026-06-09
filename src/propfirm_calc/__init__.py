"""propfirm-calc — tiny, dependency-free math for funded-trader (prop firm) accounts.

Drawdown floors, the consistency rule, and payout eligibility — the three
calculations every prop-futures trader needs and most journals get subtly
wrong. Bring your own numbers; this library has no opinion about any specific
firm and bundles no firm data.
"""

from __future__ import annotations

from .consistency import best_day_pct, consistency_ok, required_profit
from .drawdown import cushion, drawdown_floor, is_blown
from .target import (
    EligibilityResult,
    payout_eligibility,
    target_reached,
    target_remaining,
)

__version__ = "0.1.0"

__all__ = [
    "drawdown_floor",
    "is_blown",
    "cushion",
    "best_day_pct",
    "consistency_ok",
    "required_profit",
    "target_remaining",
    "target_reached",
    "payout_eligibility",
    "EligibilityResult",
    "__version__",
]
