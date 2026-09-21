# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- An optional `tui` extra (`pip install "propfirm-calc[tui]"`). When Rich is
  importable the CLI prints each command as a titled table and colours the rows
  that carry a verdict; otherwise it prints the same values as aligned plain
  text. The library and the default install remain dependency-free, and
  `--json` output is unchanged by either path.

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

[0.2.0]: https://github.com/shootingallday/propfirm-calc/releases/tag/v0.2.0
[0.1.0]: https://github.com/shootingallday/propfirm-calc/releases/tag/v0.1.0
