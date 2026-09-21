"""Terminal rendering for the CLI.

The library and its CLI install with no dependencies, so the default rendering
is aligned plain text. Installing the ``tui`` extra adds Rich, and every
command then prints a titled table with the status rows coloured. Nothing else
about the output changes, and ``--json`` is unaffected by either path.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

GOOD = "good"
BAD = "bad"
WARN = "warn"

_STYLES = {GOOD: "bold green", BAD: "bold red", WARN: "yellow"}


@dataclass(frozen=True)
class Row:
    """One label/value line of command output.

    ``tone`` marks a value whose meaning is good, bad or worth attention. The
    plain-text path ignores it.
    """

    label: str
    value: str
    tone: str | None = None


def render(title: str, rows: Sequence[Row]) -> None:
    """Print ``rows`` under ``title``, using Rich when it is installed."""
    if not _render_rich(title, rows):
        _render_plain(rows)


def _render_rich(title: str, rows: Sequence[Row]) -> bool:
    try:
        from rich.box import ROUNDED
        from rich.console import Console
        from rich.table import Table
        from rich.text import Text
    except ImportError:
        return False

    table = Table(box=ROUNDED, show_header=False, title=title, title_justify="left")
    table.add_column(style="dim", no_wrap=True)
    table.add_column(overflow="fold")
    for row in rows:
        table.add_row(row.label, Text(row.value, style=_STYLES.get(row.tone or "", "")))
    Console().print(table)
    return True


def _render_plain(rows: Sequence[Row]) -> None:
    width = max((len(row.label) for row in rows), default=0)
    for row in rows:
        print(f"{row.label.ljust(width)}  {row.value}")
