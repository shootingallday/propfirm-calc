# Contributing

A short issue before a PR is the fastest way to get a change merged.

## What's in scope

- Rules math for prop firm futures accounts: drawdown, daily loss, consistency, payouts.
- The firm catalog in `packages/core/catalog`. A rule change needs a link to the firm's own page.
- CSV imports for trading platforms. A new layout needs a real export, and personal numbers can be
  scrubbed as long as the headers stay exact.

## What's out of scope

- Broker logins or API connections. The app works from files and typing, on purpose.
- Simulation or Monte Carlo.
- Accounts, sign-in or a server. Everything stays in the user's browser.

## Setup

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm e2e
```

## Pull requests

- One behavior change per PR.
- A math change states the trading situation it fixes, with the account numbers.
- Add a `CHANGELOG.md` entry under `## [Unreleased]`.
