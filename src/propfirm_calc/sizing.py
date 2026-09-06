"""Position sizing and futures P&L in ticks.

Futures P&L is exact integer-tick arithmetic: a move of ``n`` ticks on ``c``
contracts is worth ``n * tick_value * c``. The sizing question that matters on
a funded account is not "what can I afford to lose" but "what can I afford to
lose *before the drawdown floor closes the account*" — which is the cushion,
not the balance. :func:`max_contracts_from_cushion` answers that directly.

Bring your own contract specs; this module bundles no exchange data. Common
tick values: NQ $5.00, ES $12.50, MNQ $0.50, MES $1.25, CL $10.00, GC $10.00.
"""

from __future__ import annotations

import math

from .drawdown import cushion


def pnl(ticks: float, tick_value: float, contracts: int = 1) -> float:
    """Dollar P&L of a move of ``ticks`` on ``contracts`` contracts.

    Negative ``ticks`` give a negative P&L.

    Raises:
        ValueError: If ``tick_value`` is not positive or ``contracts`` is negative.
    """
    _check_tick_value(tick_value)
    if contracts < 0:
        raise ValueError("contracts must not be negative")
    return ticks * tick_value * contracts


def ticks_to_target(target_pnl: float, tick_value: float, contracts: int = 1) -> float:
    """Ticks of favourable movement needed to make ``target_pnl``.

    Raises:
        ValueError: If ``tick_value`` is not positive or ``contracts`` is not positive.
    """
    _check_tick_value(tick_value)
    if contracts <= 0:
        raise ValueError("contracts must be positive")
    return target_pnl / (tick_value * contracts)


def position_risk(stop_ticks: float, tick_value: float, contracts: int = 1) -> float:
    """Dollars at risk if a ``stop_ticks``-wide stop is hit on ``contracts``.

    Raises:
        ValueError: If ``tick_value`` is not positive, ``stop_ticks`` is not
            positive, or ``contracts`` is negative.
    """
    _check_tick_value(tick_value)
    _check_stop_ticks(stop_ticks)
    if contracts < 0:
        raise ValueError("contracts must not be negative")
    return stop_ticks * tick_value * contracts


def max_contracts(risk_budget: float, stop_ticks: float, tick_value: float) -> int:
    """Largest whole position whose stop-out loss fits inside ``risk_budget``.

    Rounds down: a budget that affords 2.9 contracts sizes 2. A non-positive
    budget sizes 0 rather than raising, so a blown or breached account simply
    reports "no size".

    Raises:
        ValueError: If ``tick_value`` or ``stop_ticks`` is not positive.
    """
    _check_tick_value(tick_value)
    _check_stop_ticks(stop_ticks)
    if risk_budget <= 0:
        return 0
    return math.floor(risk_budget / (stop_ticks * tick_value))


def max_contracts_from_cushion(
    current_equity: float,
    starting_balance: float,
    max_drawdown: float,
    peak_equity: float,
    stop_ticks: float,
    tick_value: float,
    risk_pct: float = 100.0,
    dd_type: str = "trailing",
    lock_at: float | None = None,
) -> int:
    """Largest position that cannot breach the account if the stop is hit.

    Sizes against the distance to the drawdown floor rather than the account
    balance, so it stays correct on a trailing account where the floor has
    moved up underneath you.

    Args:
        current_equity: Current account equity.
        starting_balance: The account's starting balance.
        max_drawdown: The maximum loss limit, as a positive dollar amount.
        peak_equity: The high-water mark driving a trailing floor.
        stop_ticks: Stop distance in ticks.
        tick_value: Dollar value of one tick for one contract.
        risk_pct: Percentage of the cushion this trade may consume. The default
            of 100 sizes right up to the floor; most traders want far less.
        dd_type: One of ``"trailing"``, ``"eod_trailing"``, ``"static"``.
        lock_at: Level at which a trailing floor locks. See
            :func:`~propfirm_calc.drawdown.drawdown_floor`.

    Returns:
        A whole number of contracts, ``0`` when there is no cushion left.

    Raises:
        ValueError: If ``risk_pct`` is not in ``(0, 100]``, or if ``tick_value``
            or ``stop_ticks`` is not positive.
    """
    if not 0 < risk_pct <= 100:
        raise ValueError("risk_pct must be greater than 0 and at most 100")
    room = cushion(
        current_equity,
        starting_balance,
        max_drawdown,
        peak_equity,
        dd_type=dd_type,
        lock_at=lock_at,
    )
    return max_contracts(room * risk_pct / 100.0, stop_ticks, tick_value)


def r_multiple(realized_pnl: float, risk: float) -> float:
    """Result expressed in units of the risk taken.

    Raises:
        ValueError: If ``risk`` is not positive.
    """
    if risk <= 0:
        raise ValueError("risk must be a positive dollar amount")
    return realized_pnl / risk


def _check_tick_value(tick_value: float) -> None:
    if tick_value <= 0:
        raise ValueError("tick_value must be a positive dollar amount")


def _check_stop_ticks(stop_ticks: float) -> None:
    if stop_ticks <= 0:
        raise ValueError("stop_ticks must be a positive number of ticks")
