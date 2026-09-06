import json

import pytest

from propfirm_calc.cli import main


def run(capsys, *argv):
    code = main(list(argv))
    captured = capsys.readouterr()
    return code, captured.out, captured.err


def run_json(capsys, *argv):
    code, out, err = run(capsys, *argv, "--json")
    assert code == 0, err
    return json.loads(out)


class TestDrawdown:
    def test_trailing_floor_and_cushion(self, capsys):
        payload = run_json(
            capsys, "drawdown", "--balance", "50000", "--max-dd", "2000",
            "--peak", "51000", "--equity", "50500",
        )
        assert payload == {
            "floor": 49_000,
            "dd_type": "trailing",
            "cushion": 1_500,
            "blown": False,
        }

    def test_equity_is_optional(self, capsys):
        payload = run_json(
            capsys, "drawdown", "--balance", "50000", "--max-dd", "2000", "--peak", "51000"
        )
        assert "cushion" not in payload

    def test_text_output_is_readable(self, capsys):
        code, out, _ = run(
            capsys, "drawdown", "--balance", "50000", "--max-dd", "2000",
            "--peak", "51000", "--equity", "48900",
        )
        assert code == 0
        assert "$49,000.00" in out
        assert "Blown" in out and "yes" in out

    def test_static_type(self, capsys):
        payload = run_json(
            capsys, "drawdown", "--balance", "50000", "--max-dd", "2000",
            "--peak", "53000", "--type", "static",
        )
        assert payload["floor"] == 48_000

    def test_unknown_type_is_rejected(self, capsys):
        with pytest.raises(SystemExit):
            main(["drawdown", "--balance", "50000", "--max-dd", "2000",
                  "--peak", "51000", "--type", "nonsense"])


class TestConsistency:
    def test_within_limit(self, capsys):
        payload = run_json(
            capsys, "consistency", "--best-day", "2000", "--total", "5000", "--pct", "50"
        )
        assert payload["best_day_pct"] == 40
        assert payload["consistency_ok"] is True
        assert payload["required_profit"] == 4_000

    def test_undefined_percentage_serializes_as_null(self, capsys):
        payload = run_json(
            capsys, "consistency", "--best-day", "2000", "--total", "0", "--pct", "50"
        )
        assert payload["best_day_pct"] is None
        assert payload["consistency_ok"] is False


class TestPayout:
    def test_blockers_are_listed(self, capsys):
        payload = run_json(
            capsys, "payout", "--profit", "4000", "--winning-days", "4",
            "--min-winning-days", "5", "--best-day", "3000", "--pct", "50",
        )
        assert payload["eligible"] is False
        assert len(payload["blockers"]) == 2
        assert payload["consistency_required_profit"] == 6_000

    def test_eligible_with_no_constraints(self, capsys):
        payload = run_json(capsys, "payout", "--profit", "4000")
        assert payload["eligible"] is True
        assert payload["blockers"] == []


class TestSize:
    def test_fixed_risk_budget(self, capsys):
        payload = run_json(
            capsys, "size", "--tick-value", "5", "--stop-ticks", "20", "--risk", "500"
        )
        assert payload["contracts"] == 5
        assert payload["risk_at_stop"] == 500
        assert payload["basis"] == "risk budget"

    def test_sizing_against_the_drawdown_floor(self, capsys):
        payload = run_json(
            capsys, "size", "--tick-value", "5", "--stop-ticks", "20",
            "--equity", "50500", "--balance", "50000", "--max-dd", "2000",
            "--peak", "51000", "--risk-pct", "20",
        )
        assert payload["contracts"] == 3
        assert payload["basis"] == "drawdown cushion"

    def test_missing_account_inputs_exit_with_a_message(self, capsys):
        code, _, err = run(capsys, "size", "--tick-value", "5", "--stop-ticks", "20")
        assert code == 2
        assert "--risk" in err

    def test_invalid_spec_exits_with_a_message(self, capsys):
        code, _, err = run(
            capsys, "size", "--tick-value", "0", "--stop-ticks", "20", "--risk", "500"
        )
        assert code == 2
        assert "tick_value" in err


class TestProject:
    def test_binding_constraint_is_reported(self, capsys):
        payload = run_json(
            capsys, "project", "--profit", "2000", "--avg-daily", "500",
            "--target", "3000", "--best-day", "3000", "--pct", "50",
        )
        assert payload["trading_days"] == 8
        assert payload["binding_constraint"] == "consistency"
        assert payload["projected_profit"] == 6_000

    def test_unreachable_projection_serializes_as_null(self, capsys):
        payload = run_json(
            capsys, "project", "--profit", "2000", "--avg-daily", "-100", "--target", "3000"
        )
        assert payload["trading_days"] is None
        assert payload["projected_profit"] is None

    def test_text_output_names_the_constraint(self, capsys):
        code, out, _ = run(
            capsys, "project", "--profit", "2000", "--avg-daily", "500", "--target", "3000"
        )
        assert code == 0
        assert "profit_target" in out


def test_version_flag(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["--version"])
    assert exc.value.code == 0
    assert "propfirm-calc" in capsys.readouterr().out


def test_no_subcommand_is_an_error():
    with pytest.raises(SystemExit) as exc:
        main([])
    assert exc.value.code != 0
