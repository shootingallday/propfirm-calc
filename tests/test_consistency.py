import math

import pytest

from propfirm_calc import best_day_pct, consistency_ok, required_profit


class TestBestDayPct:
    def test_basic_share(self):
        assert best_day_pct(1_500, 3_000) == 50.0

    def test_zero_total_is_infinite(self):
        assert best_day_pct(500, 0) == math.inf

    def test_negative_total_is_infinite(self):
        assert best_day_pct(500, -200) == math.inf


class TestConsistencyOk:
    def test_within_cap_passes(self):
        # Best day is 40% of total, under a 50% cap.
        assert consistency_ok(2_000, 5_000, 50) is True

    def test_at_cap_passes(self):
        assert consistency_ok(2_500, 5_000, 50) is True

    def test_over_cap_fails(self):
        assert consistency_ok(3_000, 5_000, 50) is False

    def test_zero_total_fails(self):
        assert consistency_ok(0, 0, 50) is False


class TestRequiredProfit:
    def test_effective_target_floor(self):
        # A $1,500 day under a 50% rule needs $3,000 total before it's clean.
        assert required_profit(1_500, 50) == 3_000

    def test_tighter_rule_needs_more(self):
        # Same day under a 30% rule needs $5,000.
        assert required_profit(1_500, 30) == pytest.approx(5_000)

    def test_non_positive_pct_raises(self):
        with pytest.raises(ValueError):
            required_profit(1_500, 0)
