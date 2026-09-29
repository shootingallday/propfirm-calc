# propfirm-calc

Drawdown, consistency, payout and CSV import math for prop firm futures accounts, with an open
rules catalog for Topstep, Tradeify, Lucid Trading, My Funded Futures and Take Profit Trader.

It powers the [propfirm-calc web app](https://propfirm-calc.jomardippiton2005.workers.dev), which
shows every account you trade on one screen, with a what-if slider and a payout calendar.

```bash
npm install propfirm-calc
```

## Use it in code

```ts
import { applyImport, createAccount, evaluate, FIRMS, importCsv } from 'propfirm-calc';

const firm = FIRMS.find((f) => f.id === 'topstep')!;
const plan = firm.plans[0]!;
let account = createAccount({ id: '1', label: 'Topstep 50K', firm, plan, stage: 'eval', catalogVersion: '2026-09-29' });

const csv = importCsv(fileText);
account = applyImport(account, csv.accounts[0]!, csv.layout).account;

const now = evaluate(account);
const tomorrow = evaluate(account, { whatIf: -800 });
now.floor; now.cushion; now.consistency; now.evaluation?.daysToPass;
tomorrow.blown;
```

Money is `decimal.js` throughout, so nothing drifts by a cent.

## Use it from the terminal

```bash
npx propfirm-calc drawdown --balance 50000 --max-dd 2000 --peak 51000 --equity 50500
npx propfirm-calc consistency --best-day 1500 --total 3000 --pct 50
npx propfirm-calc payout --profit 4000 --best-day 3000 --pct 50
npx propfirm-calc size --tick-value 5 --stop-ticks 20 --risk 500
npx propfirm-calc project --profit 2000 --avg-daily 500 --target 3000 --best-day 3000 --pct 50
npx propfirm-calc firms
npx propfirm-calc import Fills.csv
npx propfirm-calc status propfirm-calc-accounts.json --what-if -800
```

Every command takes `--json`.

## CSV import

Tradovate Fills, Performance, Account Balance History and Cash History, and TopstepX Orders and
Trades. Fills and orders are paired into trades, and a fee per contract per side covers fees the
file leaves out.

## Firm rules

Rules come from each firm's own pages. Every stage records its source link and the day it was
checked, because firms change them every few months. Report a wrong rule at
[github.com/shootingallday/propfirm-calc](https://github.com/shootingallday/propfirm-calc/issues).

Needs Node 20.10 or later. MIT licensed.
