"""Command-line interface for propfirm-calc.

Exposes the library's calculations to traders who do not write Python. Every
subcommand accepts ``--json`` for scripting; infinite values (an unreachable
payout, an undefined percentage) serialize as ``null``. Text output is rendered
by :mod:`propfirm_calc.render`, which upgrades to tables when the ``tui`` extra
is installed.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections.abc import Sequence
from typing import Any

from . import __version__
from .consistency import best_day_pct, consistency_ok, required_profit
from .drawdown import cushion, drawdown_floor, is_blown
from .projection import payout_projection
from .render import BAD, GOOD, WARN, Row, render
from .sizing import max_contracts, max_contracts_from_cushion, position_risk
from .target import payout_eligibility

DD_TYPES = ("trailing", "eod_trailing", "static")


def main(argv: Sequence[str] | None = None) -> int:
    """Entry point. Returns a process exit code."""
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        rows, payload = args.handler(args)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(_jsonable(payload), indent=2))
    else:
        render(args.title, rows)
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="propfirm-calc",
        description="Drawdown, consistency, payout, sizing and projection math "
        "for funded-trader futures accounts.",
    )
    parser.add_argument("--version", action="version", version=f"propfirm-calc {__version__}")
    subs = parser.add_subparsers(dest="command", required=True)

    commands = (
        (
            "drawdown",
            "Drawdown",
            "Drawdown floor, cushion and breach status",
            _add_drawdown,
            _run_drawdown,
        ),
        (
            "consistency",
            "Consistency rule",
            "Best-day percentage against the consistency cap",
            _add_consistency,
            _run_consistency,
        ),
        (
            "payout",
            "Payout eligibility",
            "Whether a payout is available right now, and what blocks it",
            _add_payout,
            _run_payout,
        ),
        (
            "size",
            "Position size",
            "Largest position that respects a risk budget or the drawdown floor",
            _add_size,
            _run_size,
        ),
        (
            "project",
            "Payout projection",
            "Trading days until a payout becomes available",
            _add_project,
            _run_project,
        ),
    )

    for name, title, help_text, configure, handler in commands:
        sub = subs.add_parser(name, help=help_text, description=help_text)
        sub.add_argument("--json", action="store_true", help="emit JSON instead of text")
        configure(sub)
        sub.set_defaults(handler=handler, title=title)

    return parser


def _add_account(sub: argparse.ArgumentParser, *, required: bool) -> None:
    sub.add_argument("--balance", type=float, required=required, help="starting balance")
    sub.add_argument(
        "--max-dd", type=float, required=required, help="maximum loss limit in dollars"
    )
    sub.add_argument("--peak", type=float, required=required, help="high-water mark equity")
    sub.add_argument(
        "--type",
        dest="dd_type",
        choices=DD_TYPES,
        default="trailing",
        help="drawdown regime (default: trailing)",
    )
    sub.add_argument(
        "--lock-at", type=float, default=None, help="level at which a trailing floor locks"
    )


def _add_drawdown(sub: argparse.ArgumentParser) -> None:
    _add_account(sub, required=True)
    sub.add_argument(
        "--equity", type=float, default=None, help="current equity, for cushion and breach status"
    )


def _run_drawdown(args: argparse.Namespace) -> tuple[list[Row], dict[str, Any]]:
    floor = drawdown_floor(
        args.balance, args.max_dd, args.peak, dd_type=args.dd_type, lock_at=args.lock_at
    )
    payload: dict[str, Any] = {"floor": floor, "dd_type": args.dd_type}
    rows = [Row("Drawdown floor", _money(floor))]

    if args.equity is not None:
        room = cushion(
            args.equity,
            args.balance,
            args.max_dd,
            args.peak,
            dd_type=args.dd_type,
            lock_at=args.lock_at,
        )
        blown = is_blown(
            args.equity,
            args.balance,
            args.max_dd,
            args.peak,
            dd_type=args.dd_type,
            lock_at=args.lock_at,
        )
        payload.update({"cushion": room, "blown": blown})
        rows += [
            Row("Cushion", _money(room), BAD if room <= 0 else GOOD),
            Row("Blown", "yes" if blown else "no", BAD if blown else GOOD),
        ]

    return rows, payload


def _add_consistency(sub: argparse.ArgumentParser) -> None:
    sub.add_argument("--best-day", type=float, required=True, help="largest single-day profit")
    sub.add_argument("--total", type=float, required=True, help="cumulative net profit")
    sub.add_argument("--pct", type=float, required=True, help="consistency cap as a percentage")


def _run_consistency(args: argparse.Namespace) -> tuple[list[Row], dict[str, Any]]:
    pct = best_day_pct(args.best_day, args.total)
    ok = consistency_ok(args.best_day, args.total, args.pct)
    needed = required_profit(args.best_day, args.pct)
    payload = {
        "best_day_pct": pct,
        "consistency_ok": ok,
        "required_profit": needed,
        "consistency_pct": args.pct,
    }
    rows = [
        Row("Best day", _pct(pct)),
        Row("Limit", _pct(args.pct)),
        Row("Within limit", "yes" if ok else "no", GOOD if ok else BAD),
        Row("Profit needed to clear it", _money(needed)),
    ]
    return rows, payload


def _add_constraints(sub: argparse.ArgumentParser) -> None:
    sub.add_argument("--target", type=float, default=None, help="profit target")
    sub.add_argument("--winning-days", type=int, default=None, help="winning days banked")
    sub.add_argument(
        "--min-winning-days", type=int, default=None, help="minimum winning days required"
    )
    sub.add_argument("--best-day", type=float, default=None, help="largest single-day profit")
    sub.add_argument("--pct", type=float, default=None, help="consistency cap as a percentage")


def _add_payout(sub: argparse.ArgumentParser) -> None:
    sub.add_argument("--profit", type=float, required=True, help="cumulative net profit")
    _add_constraints(sub)


def _run_payout(args: argparse.Namespace) -> tuple[list[Row], dict[str, Any]]:
    result = payout_eligibility(
        args.profit,
        profit_target=args.target,
        winning_days=args.winning_days,
        min_winning_days=args.min_winning_days,
        best_day_profit=args.best_day,
        consistency_pct=args.pct,
    )
    payload = {
        "eligible": result.eligible,
        "blockers": list(result.blockers),
        "target_met": result.target_met,
        "days_met": result.days_met,
        "consistency_met": result.consistency_met,
        "profit_remaining": result.profit_remaining,
        "consistency_required_profit": result.consistency_required_profit,
    }
    rows = [Row("Eligible", "yes" if result.eligible else "no", GOOD if result.eligible else BAD)]
    rows += [Row("Blocker", blocker, WARN) for blocker in result.blockers]
    if result.consistency_required_profit is not None:
        rows.append(Row("Consistency needs total", _money(result.consistency_required_profit)))
    return rows, payload


def _add_size(sub: argparse.ArgumentParser) -> None:
    sub.add_argument(
        "--tick-value",
        type=float,
        required=True,
        help="dollar value of one tick, one contract",
    )
    sub.add_argument("--stop-ticks", type=float, required=True, help="stop distance in ticks")
    sub.add_argument(
        "--risk", type=float, default=None, help="fixed dollar risk budget for the trade"
    )
    sub.add_argument(
        "--equity", type=float, default=None, help="current equity, to size against the floor"
    )
    sub.add_argument(
        "--risk-pct", type=float, default=100.0, help="percent of cushion to risk (default 100)"
    )
    _add_account(sub, required=False)


def _run_size(args: argparse.Namespace) -> tuple[list[Row], dict[str, Any]]:
    if args.risk is not None:
        contracts = max_contracts(args.risk, args.stop_ticks, args.tick_value)
        basis = "risk budget"
    elif None in (args.equity, args.balance, args.max_dd, args.peak):
        raise ValueError(
            "pass --risk, or all of --equity --balance --max-dd --peak "
            "to size against the drawdown floor"
        )
    else:
        contracts = max_contracts_from_cushion(
            args.equity,
            args.balance,
            args.max_dd,
            args.peak,
            args.stop_ticks,
            args.tick_value,
            risk_pct=args.risk_pct,
            dd_type=args.dd_type,
            lock_at=args.lock_at,
        )
        basis = "drawdown cushion"

    risk = position_risk(args.stop_ticks, args.tick_value, contracts)
    payload = {"contracts": contracts, "risk_at_stop": risk, "basis": basis}
    rows = [
        Row("Max contracts", str(contracts)),
        Row("Risk at stop", _money(risk)),
        Row("Sized against", basis),
    ]
    return rows, payload


def _add_project(sub: argparse.ArgumentParser) -> None:
    sub.add_argument("--profit", type=float, required=True, help="cumulative net profit")
    sub.add_argument(
        "--avg-daily", type=float, required=True, help="assumed profit per trading day"
    )
    _add_constraints(sub)


def _run_project(args: argparse.Namespace) -> tuple[list[Row], dict[str, Any]]:
    result = payout_projection(
        args.profit,
        args.avg_daily,
        profit_target=args.target,
        winning_days=args.winning_days,
        min_winning_days=args.min_winning_days,
        best_day_profit=args.best_day,
        consistency_pct=args.pct,
    )
    payload = {
        "trading_days": result.trading_days,
        "binding_constraint": result.binding_constraint,
        "projected_profit": result.projected_profit,
        "days_to_target": result.days_to_target,
        "days_to_min_days": result.days_to_min_days,
        "days_to_consistency": result.days_to_consistency,
    }
    bound = result.binding_constraint
    rows = [
        Row("Trading days to payout", _days(result.trading_days)),
        Row("Binding constraint", bound or "none - payout available", WARN if bound else GOOD),
        Row("Profit at that point", _money(result.projected_profit)),
    ]
    return rows, payload


def _money(value: float) -> str:
    return "unreachable" if math.isinf(value) else f"${value:,.2f}"


def _pct(value: float) -> str:
    return "undefined" if math.isinf(value) else f"{value:.1f}%"


def _days(value: float) -> str:
    return "never at this average" if math.isinf(value) else f"{value:,.0f}"


def _jsonable(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: None if isinstance(value, float) and math.isinf(value) else value
        for key, value in payload.items()
    }


if __name__ == "__main__":
    raise SystemExit(main())
