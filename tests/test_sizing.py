import pytest

from propfirm_calc import (
    max_contracts,
    max_contracts_from_cushion,
    pnl,
    position_risk,
    r_multiple,
    ticks_to_target,
)

NQ_TICK = 5.0
ES_TICK = 12.50


class TestPnl:
    def test_ticks_times_value_times_contracts(self):
        assert pnl(20, NQ_TICK, 3) == 300
        assert pnl(8, ES_TICK) == 100

    def test_adverse_move_is_negative(self):
        assert pnl(-12, NQ_TICK, 2) == -120

    def test_flat_position_makes_nothing(self):
        assert pnl(40, NQ_TICK, 0) == 0

    def test_rejects_bad_inputs(self):
        with pytest.raises(ValueError):
            pnl(10, 0)
        with pytest.raises(ValueError):
            pnl(10, NQ_TICK, -1)


class TestTicksToTarget:
    def test_ticks_needed_for_a_dollar_goal(self):
        assert ticks_to_target(500, NQ_TICK, 2) == 50

    def test_rejects_sizeless_position(self):
        with pytest.raises(ValueError):
            ticks_to_target(500, NQ_TICK, 0)


class TestPositionRisk:
    def test_stop_out_cost(self):
        assert position_risk(20, NQ_TICK, 3) == 300

    def test_rejects_non_positive_stop(self):
        with pytest.raises(ValueError):
            position_risk(0, NQ_TICK, 1)

    def test_rejects_negative_contracts(self):
        with pytest.raises(ValueError):
            position_risk(20, NQ_TICK, -1)


class TestMaxContracts:
    def test_rounds_down_to_whole_contracts(self):
        # $500 budget, 20-tick stop on NQ = $100/contract -> 5.
        assert max_contracts(500, 20, NQ_TICK) == 5
        # $290 affords 2.9 contracts.
        assert max_contracts(290, 20, NQ_TICK) == 2

    def test_budget_below_one_contract_sizes_zero(self):
        assert max_contracts(50, 20, NQ_TICK) == 0

    def test_non_positive_budget_sizes_zero(self):
        assert max_contracts(0, 20, NQ_TICK) == 0
        assert max_contracts(-500, 20, NQ_TICK) == 0

    def test_rejects_bad_contract_spec(self):
        with pytest.raises(ValueError):
            max_contracts(500, 20, 0)
        with pytest.raises(ValueError):
            max_contracts(500, 0, NQ_TICK)


class TestMaxContractsFromCushion:
    def test_sizes_against_the_trailing_floor_not_the_balance(self):
        # $50k account up $1k: floor is $49k, so the cushion is $1,500 at
        # $50,500 equity even though the balance is above the start.
        contracts = max_contracts_from_cushion(
            current_equity=50_500,
            starting_balance=50_000,
            max_drawdown=2_000,
            peak_equity=51_000,
            stop_ticks=20,
            tick_value=NQ_TICK,
        )
        assert contracts == 15

    def test_risk_pct_scales_the_cushion(self):
        contracts = max_contracts_from_cushion(
            current_equity=50_500,
            starting_balance=50_000,
            max_drawdown=2_000,
            peak_equity=51_000,
            stop_ticks=20,
            tick_value=NQ_TICK,
            risk_pct=20,
        )
        assert contracts == 3

    def test_breached_account_sizes_zero(self):
        assert (
            max_contracts_from_cushion(
                current_equity=48_900,
                starting_balance=50_000,
                max_drawdown=2_000,
                peak_equity=51_000,
                stop_ticks=20,
                tick_value=NQ_TICK,
            )
            == 0
        )

    def test_static_plan_uses_the_fixed_floor(self):
        contracts = max_contracts_from_cushion(
            current_equity=50_000,
            starting_balance=50_000,
            max_drawdown=2_000,
            peak_equity=53_000,
            stop_ticks=20,
            tick_value=NQ_TICK,
            dd_type="static",
        )
        # Static floor is $48k regardless of the $53k peak: $2,000 of room.
        assert contracts == 20

    def test_rejects_risk_pct_outside_range(self):
        for bad in (0, -10, 101):
            with pytest.raises(ValueError):
                max_contracts_from_cushion(
                    50_500, 50_000, 2_000, 51_000, 20, NQ_TICK, risk_pct=bad
                )


class TestRMultiple:
    def test_winner_and_loser(self):
        assert r_multiple(300, 100) == 3
        assert r_multiple(-100, 100) == -1

    def test_rejects_zero_risk(self):
        with pytest.raises(ValueError):
            r_multiple(300, 0)


def test_a_sized_position_loses_exactly_its_budget_at_the_stop():
    contracts = max_contracts(500, 20, NQ_TICK)
    assert pnl(-20, NQ_TICK, contracts) == -position_risk(20, NQ_TICK, contracts) == -500
