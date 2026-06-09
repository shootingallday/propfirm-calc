from propfirm_calc import payout_eligibility, target_reached, target_remaining


class TestTarget:
    def test_remaining_never_negative(self):
        assert target_remaining(2_500, 3_000) == 500
        assert target_remaining(4_000, 3_000) == 0

    def test_reached(self):
        assert target_reached(3_000, 3_000) is True
        assert target_reached(2_999, 3_000) is False


class TestPayoutEligibility:
    def test_all_checks_pass(self):
        r = payout_eligibility(
            6_000,
            profit_target=3_000,
            winning_days=10,
            min_winning_days=5,
            best_day_profit=2_000,
            consistency_pct=50,
        )
        assert r.eligible is True
        assert r.blockers == ()
        assert r.target_met is True
        assert r.days_met is True
        assert r.consistency_met is True

    def test_target_blocker(self):
        r = payout_eligibility(2_000, profit_target=3_000)
        assert r.eligible is False
        assert r.target_met is False
        assert r.profit_remaining == 1_000
        assert "below target" in r.blockers[0]

    def test_winning_days_blocker(self):
        r = payout_eligibility(5_000, winning_days=3, min_winning_days=5)
        assert r.eligible is False
        assert r.days_met is False
        assert "3 of 5" in r.blockers[0]

    def test_consistency_blocker_reports_required_profit(self):
        r = payout_eligibility(4_000, best_day_profit=3_000, consistency_pct=50)
        assert r.eligible is False
        assert r.consistency_met is False
        # $3k day under 50% needs $6k total before it's clean.
        assert r.consistency_required_profit == 6_000
        assert "consistency limit" in r.blockers[0]

    def test_unrequested_checks_are_none(self):
        r = payout_eligibility(5_000)
        assert r.eligible is True
        assert r.target_met is None
        assert r.days_met is None
        assert r.consistency_met is None

    def test_multiple_blockers_accumulate(self):
        r = payout_eligibility(
            1_000,
            profit_target=3_000,
            winning_days=2,
            min_winning_days=5,
        )
        assert r.eligible is False
        assert len(r.blockers) == 2
