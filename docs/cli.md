# CLI

Installing the package puts a `propfirm-calc` command on your path. Every
calculation in the library is available from it, so you don't have to write
Python to use any of this.

```console
$ pip install propfirm-calc
$ propfirm-calc --help
usage: propfirm-calc [-h] [--version] {drawdown,consistency,payout,size,project} ...
```

Every subcommand takes `--json`. Values that are infinite in the math — an
unreachable payout, a percentage of zero profit — serialize as `null` rather
than the invalid-JSON `Infinity`, so the output parses anywhere.

Invalid inputs exit with status `2` and a message on stderr.

---

## `drawdown`

The equity level at which the account is breached, plus how much room is left.

```console
$ propfirm-calc drawdown --balance 50000 --max-dd 2000 --peak 51000 --equity 50500
Drawdown floor  $49,000.00
Cushion         $1,500.00
Blown           no
```

| Option | Meaning |
| --- | --- |
| `--balance` | Starting balance. Required. |
| `--max-dd` | Maximum loss limit, as a positive dollar amount. Required. |
| `--peak` | High-water mark. Required. |
| `--type` | `trailing` (default), `eod_trailing`, or `static`. |
| `--lock-at` | Level at which a trailing floor stops rising. Defaults to the starting balance. |
| `--equity` | Current equity. Optional; adds cushion and breach status. |

For `eod_trailing`, pass your highest *end-of-day* balance as `--peak` — the
math is identical, only the input differs.

!!! tip "The trail locks"

    Most firms stop trailing once the floor reaches your starting balance, after
    which the account can never blow above break-even. That's the default. Pass
    `--lock-at` for a firm that locks elsewhere.

---

## `consistency`

Whether your best day is inside the cap, and the total profit it forces you to
reach before it becomes withdrawable.

```console
$ propfirm-calc consistency --best-day 3000 --total 4000 --pct 50
Best day                   75.0%
Limit                      50.0%
Within limit               no
Profit needed to clear it  $6,000.00
```

| Option | Meaning |
| --- | --- |
| `--best-day` | Largest single-day profit. Required. |
| `--total` | Cumulative net profit. Required. |
| `--pct` | Consistency cap as a percentage. Required. |

---

## `payout`

Whether a payout is available right now, and what is blocking it. Pass only the
constraints your firm actually imposes — anything omitted is skipped.

```console
$ propfirm-calc payout --profit 4000 --winning-days 4 --min-winning-days 5 \
    --best-day 3000 --pct 50
Eligible                 no
Blocker                  4 of 5 required winning days
Blocker                  Best day 75% over the 50% consistency limit
Consistency needs total  $6,000.00
```

| Option | Meaning |
| --- | --- |
| `--profit` | Cumulative net profit. Required. |
| `--target` | Profit target, if the firm sets one. |
| `--winning-days` / `--min-winning-days` | Both needed for the winning-days check. |
| `--best-day` / `--pct` | Both needed for the consistency check. |

---

## `size`

The largest position you can take. Two modes.

**Against a fixed risk budget** — the ordinary case:

```console
$ propfirm-calc size --tick-value 5 --stop-ticks 20 --risk 500
Max contracts  5
Risk at stop   $500.00
Sized against  risk budget
```

**Against the drawdown floor** — the one that matters on a funded account. On a
trailing plan the floor moves up underneath you, so sizing off the balance
quietly over-risks:

```console
$ propfirm-calc size --tick-value 5 --stop-ticks 20 \
    --equity 50500 --balance 50000 --max-dd 2000 --peak 51000 --risk-pct 25
Max contracts  3
Risk at stop   $300.00
Sized against  drawdown cushion
```

| Option | Meaning |
| --- | --- |
| `--tick-value` | Dollar value of one tick, one contract. Required. |
| `--stop-ticks` | Stop distance in ticks. Required. |
| `--risk` | Fixed dollar budget. Selects the first mode. |
| `--equity`, `--balance`, `--max-dd`, `--peak` | All four select the second mode. |
| `--risk-pct` | Percent of the cushion to risk. Default `100`, which sizes right up to the floor. |
| `--type`, `--lock-at` | Drawdown regime, as in `drawdown`. |

Contract specs are yours to supply; nothing is bundled. Common tick values:

| Instrument | Tick value | Instrument | Tick value |
| --- | --- | --- | --- |
| NQ | `5.00` | MNQ | `0.50` |
| ES | `12.50` | MES | `1.25` |
| CL | `10.00` | GC | `10.00` |

!!! warning "`--risk-pct 100` is not a recommendation"

    The default sizes to the absolute maximum that cannot breach the account on
    a single stop-out. It leaves no room for a second loss, slippage, or a gap.

---

## `project`

How many trading days until a payout is actually available, and which rule is
holding it up.

```console
$ propfirm-calc project --profit 2000 --avg-daily 500 --target 3000 \
    --best-day 3000 --pct 50
Trading days to payout  8
Binding constraint      consistency
Profit at that point    $6,000.00
```

The profit target here is two days away. Consistency is eight, because a $3,000
best day under a 50% rule can't be withdrawn until total profit reaches $6,000.
That gap is the thing traders miss.

| Option | Meaning |
| --- | --- |
| `--profit` | Cumulative net profit. Required. |
| `--avg-daily` | Assumed profit per future trading day. Required. |
| `--target`, `--winning-days`, `--min-winning-days`, `--best-day`, `--pct` | As in `payout`. |

A flat or losing average means the constraint is never met:

```console
$ propfirm-calc project --profit 2000 --avg-daily -100 --target 3000 --json
{
  "trading_days": null,
  "binding_constraint": "profit_target",
  "projected_profit": null,
  "days_to_target": null,
  "days_to_min_days": null,
  "days_to_consistency": null
}
```

Projections assume every future trading day is a winning day worth
`--avg-daily`. That is an optimistic floor on the timeline, not a forecast.
