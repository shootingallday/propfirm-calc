# propfirm-calc

Tiny, dependency-free Python math for **funded-trader (prop firm) futures accounts**.

Three calculations every prop-futures trader needs and most journals get subtly
wrong:

1. **Trailing drawdown floor** — the equity level at which your account blows,
   under trailing, end-of-day-trailing, or static drawdown rules.
2. **The consistency rule** — whether your best day is within the cap, and the
   *total profit* a big day forces you to reach before it's withdrawable.
3. **Payout eligibility** — target, minimum winning days, and consistency rolled
   into one answer with human-readable blockers.

No dependencies. No bundled firm data — you pass the numbers, so it works for
**any** firm (Topstep, Apex, Take Profit Trader, My Funded Futures, Lucid, …)
and never goes stale when a firm changes its rules.

## Install

```bash
pip install propfirm-calc
```

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

## Why this exists

Prop-firm rules are simple to state and easy to mis-implement — trailing
drawdown that should lock but doesn't, a consistency check that ignores the
"effective target" a big day creates, a payout gate that forgets minimum days.
`propfirm-calc` is the small, well-tested core so trading journals, dashboards,
and bots don't each reinvent (and re-bug) it.

## Development

```bash
pip install -e ".[dev]"
pytest -q
ruff check .
```

## License

MIT
