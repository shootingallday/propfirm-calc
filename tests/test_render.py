import pytest

from propfirm_calc.render import BAD, GOOD, Row, render

ROWS = (Row("Drawdown floor", "$49,000.00"), Row("Blown", "yes", BAD))


@pytest.fixture
def without_rich(monkeypatch):
    for name in ("rich", "rich.box", "rich.console", "rich.table", "rich.text"):
        monkeypatch.setitem(__import__("sys").modules, name, None)


class TestPlainFallback:
    def test_labels_are_aligned_without_rich(self, without_rich, capsys):
        render("Drawdown", ROWS)
        out = capsys.readouterr().out
        assert out == "Drawdown floor  $49,000.00\nBlown           yes\n"

    def test_title_and_tone_are_dropped(self, without_rich, capsys):
        render("Drawdown", ROWS)
        out = capsys.readouterr().out
        assert "Drawdown\n" not in out
        assert "\x1b[" not in out


class TestRichTable:
    def test_values_survive_the_table(self, capsys):
        pytest.importorskip("rich")
        render("Drawdown", ROWS)
        out = capsys.readouterr().out
        assert "Drawdown" in out
        assert "$49,000.00" in out
        assert "Blown" in out

    def test_every_row_is_rendered(self, capsys):
        pytest.importorskip("rich")
        render("Payout eligibility", [Row("Eligible", "yes", GOOD), Row("Blocker", "none")])
        out = capsys.readouterr().out
        assert out.count("\n") >= 4
