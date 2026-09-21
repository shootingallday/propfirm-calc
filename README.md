# propfirm-calc

[![CI](https://github.com/shootingallday/propfirm-calc/actions/workflows/ci.yml/badge.svg)](https://github.com/shootingallday/propfirm-calc/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/propfirm-calc.svg)](https://pypi.org/project/propfirm-calc/)
[![Python versions](https://img.shields.io/pypi/pyversions/propfirm-calc.svg)](https://pypi.org/project/propfirm-calc/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/shootingallday/propfirm-calc/blob/main/LICENSE)

Tiny, dependency-free Python math for **funded-trader (prop firm) futures accounts**.

The calculations every prop-futures trader needs and most journals get subtly
wrong:

1. **Trailing drawdown floor** — the equity level at which your account blows,
   under trailing, end-of-day-trailing, or static drawdown rules.
2. **The consistency rule** — whether your best day is within the cap, and the
   *total profit* a big day forces you to reach before it's withdrawable.
3. **Payout eligibility** — target, minimum winning days, and consistency rolled
   into one answer with human-readable blockers.
4. **Position sizing** — the largest position that cannot breach the account,
   sized against the *drawdown floor* rather than the balance.
5. **Payout projection** — how many trading days until a payout is actually
   available, and which rule is holding it up.

No dependencies. No bundled firm data — you pass the numbers, so it works for
**any** firm (Topstep, Apex, Take Profit Trader, My Funded Futures, Lucid, …)
and never goes stale when a firm changes its rules.

## Install

```bash
pip install propfirm-calc
```

Python 3.9+. Ships type information (`py.typed`) and a `propfirm-calc` CLI.

For coloured tables in the terminal, install the optional UI extra. The library
itself stays dependency-free either way:

```bash
pip install "propfirm-calc[tui]"
```

Full documentation: **<https://shootingallday.github.io/propfirm-calc/>**

## Drawdown floor — the one people get wrong

The floor depends on the firm's drawdown regime. For trailing accounts it
follows your high-water mark *up* — until it locks at your starting balance
(the Topstep/Apex behavior), after which the account can never blow above
break-even.

```python
from propfirm_calc import drawdown_floor, is_blown, cushion

# $50k account, $2k max loss limit, currently up $1k (peak equity $51k).
drawdown_floor(50_000, 2_000, peak_equity=51_000)        # 49_000  (still trailing)

# Up $3k (peak $53k): the trail has locked at the $50k start.
drawdown_floor(50_000, 2_000, peak_equity=53_000)        # 50_000  (locked)

# Static plans never trail:
drawdown_floor(50_000, 2_000, peak_equity=53_000, dd_type="static")   # 48_000

# End-of-day trailing? Same math — just pass your highest *EOD* balance:
drawdown_floor(50_000, 2_000, peak_equity=51_000, dd_type="eod_trailing")  # 49_000

is_blown(current_equity=48_900, starting_balance=50_000,
         max_drawdown=2_000, peak_equity=51_000)          # True
cushion(49_500, 50_000, 2_000, peak_equity=51_000)        # 500.0  ($ before you blow)
```

Some firms lock the trail somewhere other than the start, or never lock at all:

```python
drawdown_floor(50_000, 2_000, peak_equity=53_000, lock_at=50_100)        # 50_100
drawdown_floor(50_000, 2_000, peak_equity=60_000, lock_at=float("inf"))  # 58_000
```

## Consistency rule

```python
from propfirm_calc import consistency_ok, best_day_pct, required_profit

best_day_pct(2_000, total_profit=5_000)        # 40.0
consistency_ok(2_000, 5_000, consistency_pct=50)   # True  (40% <= 50%)
consistency_ok(3_000, 5_000, consistency_pct=50)   # False (60% > 50%)

# A $1,500 day under a 50% rule can't be withdrawn until total profit hits $3,000:
required_profit(1_500, consistency_pct=50)     # 3_000.0
```

## Payout eligibility

Pass only the constraints your firm imposes — anything omitted is skipped.

```python
from propfirm_calc import payout_eligibility

r = payout_eligibility(
    current_profit=4_000,
    profit_target=3_000,
    winning_days=4,
    min_winning_days=5,
    best_day_profit=3_000,
    consistency_pct=50,
)
r.eligible            # False
r.blockers            # ('4 of 5 required winning days',
                      #  'Best day 75% over the 50% consistency limit')
r.consistency_required_profit   # 6_000.0
```

## Position sizing — against the floor, not the balance

On a trailing account the floor moves up underneath you, so sizing off the
balance quietly over-risks. `max_contracts_from_cushion` sizes against the real
distance to a breach.

```python
from propfirm_calc import max_contracts, max_contracts_from_cushion, pnl

# Plain risk budget: $500 risk, 20-tick stop on NQ ($5/tick) = $100/contract.
max_contracts(500, stop_ticks=20, tick_value=5.0)      # 5

# $50k account at $50,500 with a $51k peak: the floor is $49k, cushion $1,500.
# Risk a quarter of it on a 20-tick NQ stop:
max_contracts_from_cushion(
    current_equity=50_500, starting_balance=50_000,
    max_drawdown=2_000, peak_equity=51_000,
    stop_ticks=20, tick_value=5.0, risk_pct=25,
)                                                       # 3

pnl(ticks=20, tick_value=5.0, contracts=3)              # 300.0
```

Bring your own contract specs. Common tick values: NQ `5.00`, ES `12.50`,
MNQ `0.50`, MES `1.25`, CL `10.00`, GC `10.00`.

## Payout projection — when, not just whether

```python
from propfirm_calc import payout_projection

# $2k profit, averaging $500/day, $3k target — but a $3k best day under a
# 50% consistency rule needs $6k total, so consistency binds, not the target.
p = payout_projection(
    current_profit=2_000,
    avg_daily_profit=500,
    profit_target=3_000,
    best_day_profit=3_000,
    consistency_pct=50,
)
p.trading_days         # 8.0
p.binding_constraint   # 'consistency'
p.days_to_target       # 2.0
p.projected_profit     # 6_000.0
```

Projections assume every future trading day is a winning day worth
`avg_daily_profit` — an optimistic floor on the timeline, not a forecast.

## CLI

Every calculation is available without writing Python. Add `--json` to any
subcommand for scripting; unreachable or undefined values serialize as `null`.

```console
$ propfirm-calc drawdown --balance 50000 --max-dd 2000 --peak 51000 --equity 50500
Drawdown floor  $49,000.00
Cushion         $1,500.00
Blown           no

$ propfirm-calc size --tick-value 5 --stop-ticks 20 \
    --equity 50500 --balance 50000 --max-dd 2000 --peak 51000 --risk-pct 25
Max contracts  3
Risk at stop   $300.00
Sized against  drawdown cushion

$ propfirm-calc project --profit 2000 --avg-daily 500 --target 3000 \
    --best-day 3000 --pct 50
Trading days to payout  8
Binding constraint      consistency
Profit at that point    $6,000.00
```

`propfirm-calc --help` lists all subcommands: `drawdown`, `consistency`,
`payout`, `size`, `project`.

The output above is the plain install. With `propfirm-calc[tui]` the same
commands print a titled table and colour the rows that carry a verdict — a
breached account, a best day over the consistency cap, the constraint holding
up a payout. The numbers and the `--json` output are identical.

```console
$ propfirm-calc payout --profit 4000 --target 3000 --winning-days 4     --min-winning-days 5 --best-day 3000 --pct 50
Payout eligibility
╭─────────────────────────┬─────────────────────────────────────────────╮
│ Eligible                │ no                                          │
│ Blocker                 │ 4 of 5 required winning days                │
│ Blocker                 │ Best day 75% over the 50% consistency limit │
│ Consistency needs total │ $6,000.00                                   │
╰─────────────────────────┴─────────────────────────────────────────────╯
```

## Why this exists

Prop-firm rules are simple to state and easy to mis-implement — trailing
drawdown that should lock but doesn't, a consistency check that ignores the
"effective target" a big day creates, a payout gate that forgets minimum days,
position sizing that reads the balance instead of the floor. `propfirm-calc` is
the small, well-tested core so trading journals, dashboards, and bots don't each
reinvent (and re-bug) it.

## Development

```bash
pip install -e ".[dev]"
pytest -q
ruff check .
ruff format --check .
mypy
```

Contributions welcome — see [CONTRIBUTING.md](https://github.com/shootingallday/propfirm-calc/blob/main/CONTRIBUTING.md). Release notes
live in [CHANGELOG.md](https://github.com/shootingallday/propfirm-calc/blob/main/CHANGELOG.md).

## License

MIT
