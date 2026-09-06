# Contributing

Thanks for taking a look. This is a small library with a deliberately narrow
scope, so the fastest path to a merged change is a short issue first.

## Scope

`propfirm-calc` is **math only, dependency-free, and firm-agnostic**. It takes
numbers you supply and returns numbers.

In scope: calculations that funded-account traders and the tools they use need,
expressed as pure functions.

Out of scope, and will be declined:

- Bundled firm rule data (targets, drawdown amounts, consistency percentages).
  Firms change these; a table in this repo would silently go stale and give
  someone a wrong answer about their own account. Pass the numbers instead.
- Runtime dependencies. The package installs clean into any environment.
- Broker, journal, or data-feed integrations.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

## Checks

All three must pass; CI runs the same commands on Linux, macOS and Windows
across Python 3.9–3.13.

```bash
pytest -q
ruff check .
mypy
```

## Pull requests

- One behavior change per PR.
- New math needs tests that state the trading situation, not just the numbers —
  look at `tests/test_sizing.py` for the style.
- Public functions get a docstring with `Args`, `Returns` and `Raises`, matching
  the existing modules.
- Add a `CHANGELOG.md` entry under an `## [Unreleased]` heading.
- Don't bump the version in `pyproject.toml`; releases are cut separately.

## Reporting a wrong answer

If a calculation disagrees with what a firm actually did to your account, that's
the most valuable kind of issue. Include the account numbers involved (starting
balance, max loss, peak equity, the equity at breach) and what the firm's
platform showed. Use the "Wrong calculation" issue template.

## Releasing

Maintainers only. Bump the version in `pyproject.toml` and
`src/propfirm_calc/__init__.py`, move the `Unreleased` changelog section under
the new version, then publish a GitHub Release tagged `vX.Y.Z`. The
`release.yml` workflow publishes to PyPI via trusted publishing.
