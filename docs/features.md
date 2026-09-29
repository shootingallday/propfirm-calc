# Features, for the wireframe

Everything the web app does today, screen by screen, plus what the engine already works out
but no screen shows yet. Read from the code on `feat/web-app` (2026-09-29).

## Whole app

- Header: logo and name, four tabs (Dashboard, Accounts, Import, Calendar).
- "Load demo accounts" link in the header, shown only when there are no accounts.
- Footer: "Firm rules checked up to <date>", data stays in the browser, GitHub link.
- Installs as an app (PWA) and works offline.
- Everything is saved in the browser automatically. No sign-in, no server.

## Dashboard

**Empty state:** "No accounts yet", one line of help, "Add an account" button (goes to Accounts).

**Summary strip:** 4 numbers.
- Accounts (count)
- Net profit (all accounts, green or red)
- Payouts ready (count)
- Blown (count)

**What-if slider:** "What if tomorrow is $X on every included account?"
- Range -$3,000 to +$3,000 in $50 steps, with a reset link.
- If a firm stops you at a daily loss limit, the day is capped there and a note says so.

**Account cards:** one per account, in a grid. Each card has:
- Name, plan and size, and a stage badge (Evaluation, Funded, Live…).
- "what-if" checkbox: include this account in the slider.
- Number line: floor mark, start mark, a dot for the balance, and the target (evaluation)
  or peak (funded) at the right end. The dot turns red when blown.
- 4 figures: Balance, Cushion (room above the floor; red at $0), Profit, Best day
  (with its % of profit when there's a consistency rule).
- Consistency line: "Consistency 50%: within the limit", or what it needs.
- Next step, one line. One of:
  - "Blown on <date> (drawdown / daily loss limit)"
  - "Payout ready via <path>: about $X to you"
  - "Payout in N trading days via <path>"
  - "Pass in N trading days" / "Passed"
- Notes in small text (e.g. "Days entered without trade times can only be checked at the
  close").
- When the slider is moved: "If tomorrow is $X: Blows the account · Unlocks a payout…"
  Possible changes: blows the account, breaks the daily loss limit, hits the daily loss lock,
  breaks or fixes consistency, passes the evaluation, unlocks or loses a payout.
- Card looks different when blown, and faded when left out of the what-if.

## Accounts

Two columns: a list on the left, the chosen account (or the add form) on the right.

**Left list**
- "+ Add account" button.
- Each account: name, with its stage under it.
- Data tools at the bottom: "Export all" (downloads a JSON backup) and "Import file"
  (loads a backup; shows "Loaded <file>" or the error).

**Add an account form**
- Firm dropdown (Topstep, Tradeify, Lucid Trading, MyFundedFutures, Take Profit Trader).
- Plan dropdown (program and size, e.g. "Rapid · $50,000").
- Stage dropdown (Evaluation, Funded, Live, depending on the plan).
- Name (optional; defaults to e.g. "Topstep Trading Combine 50K").
- Fee per contract per side.
- Rules summary for what's picked (see below).
- "Add account" button, then that account opens.

**Rules summary** (on the add form and on each account)
- Drawdown: amount, type, where it locks.
- Profit target, minimum trading days.
- Daily loss limit and whether it fails you or just stops you for the day.
- Consistency % and what it's measured against.
- Each payout path: name, split, winning days needed, consistency.
- The firm's notes (long text with quotes).
- "Checked <date> · source" link to the firm's page, and a reminder that rules change.

**One account**
- Name you can edit in place.
- Plan id, stage badge, "linked to <broker account ids>" once an import matched it.
- Delete button (asks first).
- After passing an evaluation: "Passed. Add the Funded account with its rules filled in?"
  with a button.
- "Override this account's rules" (folded away): drawdown amount, drawdown type, profit
  target, daily loss limit, consistency %, fee. Changes only this account.
- Daily P&L panel:
  - Date + amount + "Save day" (typing a date that exists replaces it).
  - Table, newest first: day, net P&L, source (typed / which export, "fees on N sides"),
    remove link.
  - Empty: "No days yet. Type them here or import a CSV."
- Payouts panel:
  - Date + amount + "Record payout".
  - List: date, amount, remove link.
  - Empty: "No payouts recorded. Recording one starts a new payout cycle."

## Import

- One line on what it reads, and that files never leave the browser.
- File picker / drop zone, more than one file at a time.
- Files it reads:
  - Tradovate: Fills, Performance, Account Balance History, Cash History.
  - TopstepX: Orders, Trades (it recommends Orders; Trades can drop round trips).
- Per file: file name, a badge with the kind it found, then a table:
  - Account id in the file, number of days, date range, net P&L, number of payouts.
  - "Goes into" dropdown: pick one of your accounts or Skip. Picked for you if it matched
    before.
  - Warnings under the table (e.g. rows it skipped).
- Errors per file (wrong kind of export, file too big, a resaved file it can't trust).
- "Apply import" button, then a log per account: "added N days, replaced N (dates),
  N payouts".

## Calendar

- One line: it assumes every future trading day is the same winning day, best case, and skips
  weekends and exchange holidays.
- Table per account: name, measured average winning day ("from N winning days", warned when
  under 5), and a box to type your own average day.
- Weeks, next 60 trading days. Each week: "Week of <date>", total for the week, and events:
  - "<date> <account>: passes the evaluation"
  - "<date> <account>: about $X to you via <path>"
- Empty: "Nothing lands in the next 60 trading days at these averages."
- "Not on the calendar" list with why (e.g. "Needs an average day above $0").
- Empty (no accounts): "Add accounts to see when they can pay out."

## Worked out by the engine but not shown anywhere yet

Room for the redesign; each is already calculated for every account.

- Every payout path ranked, not just the best, each with its blockers in plain words
  ("3 of 5 winning days of $150+", "Balance must reach $52,100 ($900 to go)",
  "Opens 2026-10-14", "Closed: open only while the balance is under $52,100").
- Per path: profit this cycle, cycle start date, winning days so far vs needed, amount you
  can withdraw (before the split) and what you'd get (after), days until eligible.
- Evaluation: profit still needed, target after consistency raises it, trading days so far
  vs needed, blockers.
- Peak balance, total paid out, number of trading days, last day entered.
- Every day that hit the daily loss limit.
- Average winning day and the average day the estimates used.
- The day the account blew, and why.

Not calculated yet: the floor day by day (for a balance-vs-floor chart). The engine walks it
but only returns today's floor; returning the series is a small change.

## Also in the package, not in the app

The `propfirm-calc` npm package has a CLI with the same engine: `drawdown`, `consistency`,
`payout`, `size` (contracts for a risk), `project` (days to a target), `firms`, `import`,
`status`. Sizing and projection have no screen in the web app.
