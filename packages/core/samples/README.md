# Sample exports

Every file here is synthetic. No row comes from a real account. The layouts copy real exports
filed in PX Journals (`docs/research/csv-exports/`): the same headers, quoting, CRLF line
endings, the TopstepX byte-order mark, Tradovate's leading spaces (` Buy`, ` Commission`), and
the platforms' number and date formats.

## The story

Three prop firm accounts trading September 2026 (Labor Day, 2026-09-07, is skipped):

| Account | Platform | Files | Trading days |
| --- | --- | --- | --- |
| `TPT50K-1` | Tradovate | fills, performance, balance history | 10, 2026-09-01 to 2026-09-15 |
| `MFFU50K-2` | Tradovate | fills, balance history, cash history | 9, 2026-09-02 to 2026-09-15 |
| `TSX50K-3` | TopstepX | orders, trades | 8, 2026-09-01 to 2026-09-14 |

- `MFFU50K-2` has one outsized day: +$2,400 gross (+$2,393.00 net) on 2026-09-10, about 90% of
  its total profit, so a consistency rule fails.
- `MFFU50K-2` takes one $1,000.00 payout on 2026-09-16, in the cash history only. It falls after
  the last balance-history row, because a payout inside a balance history reads as a loss.
- Each account has a Sunday-evening trade (2026-09-13, after 18:00 New York) that belongs to
  Monday 2026-09-14.
- `TPT50K-1` has a scale-out (2026-09-03) and a reversal through zero in one fill (2026-09-04).
  `TSX50K-3` has a scale-out (2026-09-03).
- The fills and performance files for `TPT50K-1` give the same gross P&L per day. The fills are
  net of the `commission` column; the balance history and cash history match the fills' net.
- The TopstepX orders and trades describe the same trades. Trades are net of `Fees` and
  `Commissions`; orders carry no costs.

## Headers the importer requires

Each list lives in `COLUMNS` in `src/imports/layouts.ts`, so a renamed column is a one-line fix.

| Layout | Required | Also read when present | Source |
| --- | --- | --- | --- |
| `tradovate-fills` | `_id`, `_timestamp`, `_action`, `_qty`, `_price`, `Account`, `Contract` | `B/S`, `commission` | real export |
| `topstepx-orders` | `Id`, `AccountName`, `ContractName`, `Status`, `Size`, `Side`, `FilledAt`, `ExecutePrice` | | real export |
| `tradovate-performance` | `buyFillId`, `sellFillId`, `qty`, `pnl`, `boughtTimestamp`, `soldTimestamp` | | real export |
| `tradovate-balance-history` | `Account Name`, `Trade Date`, `Total Amount` | | real export |
| `tradovate-cash-history` | `Account`, `Transaction ID`, `Date`, `Delta`, `Cash Change Type` | | real export |
| `topstepx-trades` | `Id`, `ExitedAt`, `PnL`, `Size` | `Fees`, `Commissions`, `TradeDay` | real export |

## What is still assumed

- Tradovate display timestamps (`boughtTimestamp`, `soldTimestamp`) have no zone. The real
  exports show US Eastern; the importer assumes that. A trader whose Tradovate shows another zone
  would get Performance days wrong near the 18:00 New York roll.
- Cash History: only ` Commission` and ` Trade Paired` have been seen in a real export. The
  payout type (` Withdrawal` here) and fee types are guesses: any type containing "withdraw" or
  "payout" is a payout, any containing "fee" counts as trading cost.
- Cash History's `Amount` is the running balance, not the change. `Delta` is the change.
- TopstepX Trades `PnL` is gross in the real export (short 3 MNQ from 28995 to 29002.25 reads
  -43.5), so `Fees` and `Commissions` are subtracted. Whether `Fees` already includes
  `Commissions` is not known.
- Tradovate Fills identifies the account by `Account` (the name, as in balance and cash history),
  not `_accountId`.
