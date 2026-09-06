import math

from propfirm_calc import days_to_profit, payout_projection


class TestDaysToProfit:
    def test_rounds_up_to_whole_trading_days(self):
        # $1,000 to go at $300/day is 3.33 days, so 4.
        assert days_to_profit(2_000, 3_000, 300) == 4

    def test_already_there_is_zero_days(self):
        assert days_to_profit(3_000, 3_000, 300) == 0
        assert days_to_profit(4_000, 3_000, 300) == 0

    def test_flat_or_losing_average_never_arrives(self):
        assert days_to_profit(2_000, 3_000, 0) == math.inf
        assert days_to_profit(2_000, 3_000, -100) == math.inf


class TestPayoutProjection:
    def test_target_binds_when_it_is_furthest_out(self):
        r = payout_projection(1_000, 500, profit_target=3_000, winning_days=4, min_winning_days=5)
        assert r.days_to_target == 4
        assert r.days_to_min_days == 1
        assert r.trading_days == 4
        assert r.binding_constraint == "profit_target"
        assert r.projected_profit == 3_000

    def test_winning_days_bind_when_profit_arrives_first(self):
        r = payout_projection(2_800, 500, profit_target=3_000, winning_days=1, min_winning_days=5)
        assert r.days_to_target == 1
        assert r.trading_days == 4
        assert r.binding_constraint == "winning_days"

    def test_a_big_day_can_push_the_payout_past_the_target(self):
        # $3k day under a 50% rule needs $6k total, double the $3k target.
        r = payout_projection(
            2_000, 500, profit_target=3_000, best_day_profit=3_000, consistency_pct=50
        )
        assert r.days_to_target == 2
        assert r.days_to_consistency == 8
        assert r.trading_days == 8
        assert r.binding_constraint == "consistency"
        assert r.projected_profit == 6_000

    def test_already_eligible_reports_no_constraint(self):
        r = payout_projection(5_000, 500, profit_target=3_000, winning_days=6, min_winning_days=5)
        assert r.trading_days == 0
        assert r.binding_constraint is None
        assert r.projected_profit == 5_000

    def test_losing_average_never_banks_winning_days(self):
        r = payout_projection(5_000, -200, winning_days=1, min_winning_days=5)
        assert r.days_to_min_days == math.inf
        assert r.trading_days == math.inf
        assert r.binding_constraint == "winning_days"
        assert r.projected_profit == math.inf

    def test_unrequested_constraints_are_none(self):
        r = payout_projection(1_000, 500, profit_target=3_000)
        assert r.days_to_min_days is None
        assert r.days_to_consistency is None

    def test_no_constraints_means_nothing_to_wait_for(self):
        r = payout_projection(1_000, 500)
        assert r.trading_days == 0
        assert r.binding_constraint is None
