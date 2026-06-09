import math

import pytest

from propfirm_calc import cushion, drawdown_floor, is_blown


class TestStatic:
    def test_floor_is_fixed_at_start_minus_dd(self):
        # A static $50k account with a $2k drawdown: floor never moves off 48k.
        assert drawdown_floor(50_000, 2_000, peak_equity=60_000, dd_type="static") == 48_000

    def test_peak_is_ignored_for_static(self):
        low = drawdown_floor(50_000, 2_000, peak_equity=50_000, dd_type="static")
        high = drawdown_floor(50_000, 2_000, peak_equity=99_000, dd_type="static")
        assert low == high == 48_000


class TestTrailing:
    def test_floor_trails_the_peak_before_locking(self):
        # Up $1k (peak 51k) on a 50k/2k account: floor = 51k - 2k = 49k, still
        # below the 50k lock, so it trails.
        assert drawdown_floor(50_000, 2_000, peak_equity=51_000) == 49_000

    def test_floor_locks_at_starting_balance(self):
        # Once peak - dd would exceed the start, the floor locks at start.
        # peak 53k -> raw 51k, capped at 50k.
        assert drawdown_floor(50_000, 2_000, peak_equity=53_000) == 50_000

    def test_floor_at_exactly_the_lock_point(self):
        # peak 52k -> raw 50k == start: locked exactly at start.
        assert drawdown_floor(50_000, 2_000, peak_equity=52_000) == 50_000

    def test_initial_floor_when_peak_equals_start(self):
        assert drawdown_floor(50_000, 2_000, peak_equity=50_000) == 48_000

    def test_custom_lock_level(self):
        # A firm that locks the trail at start + $100 instead of start.
        assert drawdown_floor(50_000, 2_000, peak_equity=53_000, lock_at=50_100) == 50_100

    def test_never_locking_floor_keeps_trailing(self):
        # lock_at=inf -> pure trailing, floor can rise into profit.
        assert drawdown_floor(50_000, 2_000, peak_equity=60_000, lock_at=math.inf) == 58_000


class TestEodTrailing:
    def test_same_math_as_trailing_given_eod_peak(self):
        # eod_trailing differs only in *which* peak you pass; the math matches.
        intraday = drawdown_floor(100_000, 3_000, peak_equity=104_000, dd_type="trailing")
        eod = drawdown_floor(100_000, 3_000, peak_equity=104_000, dd_type="eod_trailing")
        assert intraday == eod == 100_000  # raw 101k capped at 100k start


class TestIsBlownAndCushion:
    def test_not_blown_with_room(self):
        assert is_blown(49_500, 50_000, 2_000, peak_equity=51_000) is False
        assert cushion(49_500, 50_000, 2_000, peak_equity=51_000) == 500

    def test_blown_below_floor(self):
        assert is_blown(48_900, 50_000, 2_000, peak_equity=51_000) is True

    def test_touching_floor_exactly_is_a_breach(self):
        floor = drawdown_floor(50_000, 2_000, peak_equity=51_000)  # 49_000
        assert is_blown(floor, 50_000, 2_000, peak_equity=51_000) is True
        assert cushion(floor, 50_000, 2_000, peak_equity=51_000) == 0


class TestValidation:
    def test_unknown_dd_type_raises(self):
        with pytest.raises(ValueError):
            drawdown_floor(50_000, 2_000, 50_000, dd_type="weird")

    def test_negative_max_drawdown_raises(self):
        with pytest.raises(ValueError):
            drawdown_floor(50_000, -1, 50_000)
