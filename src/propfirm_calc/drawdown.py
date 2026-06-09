"""Trailing / EOD-trailing / static drawdown math for funded-trader accounts.

The number traders most often get wrong is the *current* drawdown floor — the
equity level at which the account is breached ("blown"). It depends on the
firm's drawdown regime:

- ``"static"``        — a fixed floor at ``starting_balance - max_drawdown``
                        that never moves.
- ``"trailing"``      — the floor follows the account's highest equity point
                        (including intraday peaks), so it trails *up* as you
                        make new highs.
- ``"eod_trailing"``  — identical math, but the peak is the highest
                        *end-of-day* balance rather than the intraday high.
                        The only difference is what you pass as ``peak_equity``.

Most firms (Topstep, Apex, …) stop trailing once the floor reaches the starting
balance: from then on the floor is *locked* and the account can never blow
above break-even. That lock level is configurable via ``lock_at``.
"""

from __future__ import annotations

_TRAILING = {"trailing", "eod_trailing"}
_VALID = _TRAILING | {"static"}


def drawdown_floor(
    starting_balance: float,
    max_drawdown: float,
    peak_equity: float,
    dd_type: str = "trailing",
    lock_at: float | None = None,
) -> float:
    """Return the equity level at or below which the account is breached.

    Args:
        starting_balance: The account's starting balance.
        max_drawdown: The maximum loss limit, as a positive dollar amount.
        peak_equity: The high-water mark. For ``"trailing"`` pass the highest
            equity ever touched (intraday included); for ``"eod_trailing"``
            pass the highest end-of-day balance. Ignored for ``"static"``.
        dd_type: One of ``"trailing"``, ``"eod_trailing"``, ``"static"``.
        lock_at: The equity level at which a trailing floor stops rising and
            locks. ``None`` (default) locks at ``starting_balance`` — the
            common Topstep/Apex behavior. Pass ``math.inf`` for a floor that
            never locks (keeps trailing forever).

    Returns:
        The drawdown floor as an equity level (not a distance).

    Raises:
        ValueError: If ``dd_type`` is unknown or ``max_drawdown`` is negative.
    """
    if dd_type not in _VALID:
        raise ValueError(f"dd_type must be one of {sorted(_VALID)}, got {dd_type!r}")
    if max_drawdown < 0:
        raise ValueError("max_drawdown must be a positive dollar amount")

    if dd_type == "static":
        return starting_balance - max_drawdown

    raw = peak_equity - max_drawdown
    cap = starting_balance if lock_at is None else lock_at
    return min(raw, cap)


def is_blown(
    current_equity: float,
    starting_balance: float,
    max_drawdown: float,
    peak_equity: float,
    dd_type: str = "trailing",
    lock_at: float | None = None,
) -> bool:
    """True if ``current_equity`` has reached or fallen below the floor.

    Touching the floor exactly counts as a breach (``<=``), matching how most
    firms enforce their maximum loss limit.
    """
    floor = drawdown_floor(
        starting_balance, max_drawdown, peak_equity, dd_type=dd_type, lock_at=lock_at
    )
    return current_equity <= floor


def cushion(
    current_equity: float,
    starting_balance: float,
    max_drawdown: float,
    peak_equity: float,
    dd_type: str = "trailing",
    lock_at: float | None = None,
) -> float:
    """Dollars of room before the account blows.

    Positive means safe; zero or negative means the floor has been reached.
    """
    floor = drawdown_floor(
        starting_balance, max_drawdown, peak_equity, dd_type=dd_type, lock_at=lock_at
    )
    return current_equity - floor
