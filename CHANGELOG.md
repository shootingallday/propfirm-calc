# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-09-29

### Changed

- Rewritten in TypeScript as a pnpm monorepo. The math lives in the `propfirm-calc` npm package
  (`packages/core`), and money is `decimal.js` throughout. Every case from the Python test
  suite gives the same answer in the new engine. The Python package, its CLI extras and the
  MkDocs site are gone. Releases now go to npm instead of PyPI.

### Added

- A web app (`apps/web`) that installs as a PWA. Pick accounts from the firm list, enter daily
  P&L or import a CSV, and see every account together, with a what-if slider and a payout
  calendar. Data stays in the browser. It has one table of accounts with a side panel for
  each, a balance and floor chart, and light and dark themes.
  A first visit opens with five demo accounts, one per firm, and one click clears them.
- A firm rules catalog for Topstep, Tradeify, Lucid Trading, My Funded Futures and Take Profit
  Trader. Each stage has a source link and the date it was checked.
- Account rules the Python version couldn't express: daily loss limits (breach or session lock),
  consistency measured against total profit, profit since the last payout, or the profit target,
  with the best day resetting or carrying over after a payout, multiple payout paths with
  buffers, caps and splits, and a floor that changes after the first payout.
- CSV import for Tradovate Fills, Performance, Account Balance History and Cash History, and for
  TopstepX Orders and Trades. Fills and orders are paired into trades, and a per-account fee per
  contract per side covers fees the file leaves out.
- CLI commands `firms`, `import` and `status`.

## [0.2.0] — 2026-09-06

### Added

- `propfirm_calc.sizing`: `pnl`, `ticks_to_target`, `position_risk`,
  `max_contracts`, `max_contracts_from_cushion` and `r_multiple`.
  `max_contracts_from_cushion` sizes against the distance to the drawdown floor
  rather than the account balance, which is what keeps sizing correct on a
  trailing account.
- `propfirm_calc.projection`: `days_to_profit` and `payout_projection`, which
  run every payout constraint forward at an assumed average daily profit and
  report which one binds. A large best day frequently pushes the payout date out
  further than the profit target does.
- A `propfirm-calc` command-line interface with `drawdown`, `consistency`,
  `payout`, `size` and `project` subcommands, each supporting `--json`.
- `py.typed`, so type checkers see the annotations that the
  `Typing :: Typed` classifier has always advertised.

### Fixed

- The published wheel declared itself typed but shipped no `py.typed` marker, so
  `mypy` and `pyright` treated the package as untyped.

### Changed

- `ruff` is now pinned in the dev extra, and lint selects `E`, `F`, `I`, `UP`,
  `B` and `RUF`. `mypy --strict` runs over `src` in CI.
- CI runs on Linux, macOS and Windows, and reports coverage.

## [0.1.0] — 2026-06-09

### Added

- Initial release: `drawdown_floor`, `is_blown`, `cushion`, `best_day_pct`,
  `consistency_ok`, `required_profit`, `target_remaining`, `target_reached` and
  `payout_eligibility`.

[0.3.0]: https://github.com/shootingallday/propfirm-calc/releases/tag/v0.3.0
[0.2.0]: https://github.com/shootingallday/propfirm-calc/releases/tag/v0.2.0
[0.1.0]: https://github.com/shootingallday/propfirm-calc/releases/tag/v0.1.0
