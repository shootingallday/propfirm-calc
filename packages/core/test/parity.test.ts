import { describe, expect, it } from 'vitest';

import { bestDayPct, consistencyOk, requiredProfit } from '../src/consistency.ts';
import { cushion, drawdownFloor, isBlown, type DrawdownType } from '../src/drawdown.ts';
import { daysToProfit, payoutProjection } from '../src/projection.ts';
import { maxContracts, maxContractsFromCushion, pnl, positionRisk, rMultiple, ticksToTarget } from '../src/sizing.ts';
import { payoutEligibility, targetReached, targetRemaining } from '../src/target.ts';

const n = (value: { toNumber(): number }) => value.toNumber();
const NQ = 5;
const ES = 12.5;

describe('drawdown', () => {
  it('static floor is fixed at start minus drawdown whatever the peak', () => {
    expect(n(drawdownFloor(50_000, 2_000, 60_000, 'static'))).toBe(48_000);
    expect(n(drawdownFloor(50_000, 2_000, 50_000, 'static'))).toBe(48_000);
    expect(n(drawdownFloor(50_000, 2_000, 99_000, 'static'))).toBe(48_000);
  });
  it('trails the peak, then locks at the starting balance', () => {
    expect(n(drawdownFloor(50_000, 2_000, 51_000))).toBe(49_000);
    expect(n(drawdownFloor(50_000, 2_000, 53_000))).toBe(50_000);
    expect(n(drawdownFloor(50_000, 2_000, 52_000))).toBe(50_000);
    expect(n(drawdownFloor(50_000, 2_000, 50_000))).toBe(48_000);
  });
  it('honours a custom or infinite lock level', () => {
    expect(n(drawdownFloor(50_000, 2_000, 53_000, 'trailing', 50_100))).toBe(50_100);
    expect(n(drawdownFloor(50_000, 2_000, 60_000, 'trailing', Infinity))).toBe(58_000);
  });
  it('eod trailing is the same math given an eod peak', () => {
    expect(n(drawdownFloor(100_000, 3_000, 104_000, 'trailing'))).toBe(100_000);
    expect(n(drawdownFloor(100_000, 3_000, 104_000, 'eod_trailing'))).toBe(100_000);
  });
  it('touching the floor is a breach', () => {
    expect(isBlown(49_500, 50_000, 2_000, 51_000)).toBe(false);
    expect(n(cushion(49_500, 50_000, 2_000, 51_000))).toBe(500);
    expect(isBlown(48_900, 50_000, 2_000, 51_000)).toBe(true);
    expect(isBlown(49_000, 50_000, 2_000, 51_000)).toBe(true);
    expect(n(cushion(49_000, 50_000, 2_000, 51_000))).toBe(0);
  });
  it('rejects bad inputs', () => {
    expect(() => drawdownFloor(50_000, 2_000, 50_000, 'weird' as DrawdownType)).toThrow(RangeError);
    expect(() => drawdownFloor(50_000, -1, 50_000)).toThrow(RangeError);
  });
});

describe('consistency', () => {
  it('best day share', () => {
    expect(n(bestDayPct(1_500, 3_000))).toBe(50);
    expect(n(bestDayPct(500, 0))).toBe(Infinity);
    expect(n(bestDayPct(500, -200))).toBe(Infinity);
  });
  it('within, at and over the cap', () => {
    expect(consistencyOk(2_000, 5_000, 50)).toBe(true);
    expect(consistencyOk(2_500, 5_000, 50)).toBe(true);
    expect(consistencyOk(3_000, 5_000, 50)).toBe(false);
    expect(consistencyOk(0, 0, 50)).toBe(false);
  });
  it('required profit', () => {
    expect(n(requiredProfit(1_500, 50))).toBe(3_000);
    expect(n(requiredProfit(1_500, 30))).toBeCloseTo(5_000, 9);
    expect(() => requiredProfit(1_500, 0)).toThrow(RangeError);
  });
});

describe('target and eligibility', () => {
  it('remaining never negative', () => {
    expect(n(targetRemaining(2_500, 3_000))).toBe(500);
    expect(n(targetRemaining(4_000, 3_000))).toBe(0);
    expect(targetReached(3_000, 3_000)).toBe(true);
    expect(targetReached(2_999, 3_000)).toBe(false);
  });
  it('all checks pass', () => {
    const r = payoutEligibility(6_000, { profitTarget: 3_000, winningDays: 10, minWinningDays: 5, bestDayProfit: 2_000, consistencyPct: 50 });
    expect(r).toMatchObject({ eligible: true, blockers: [], targetMet: true, daysMet: true, consistencyMet: true });
  });
  it('reports each blocker', () => {
    const target = payoutEligibility(2_000, { profitTarget: 3_000 });
    expect(target.eligible).toBe(false);
    expect(n(target.profitRemaining!)).toBe(1_000);
    expect(target.blockers[0]).toContain('below target');
    const days = payoutEligibility(5_000, { winningDays: 3, minWinningDays: 5 });
    expect(days.daysMet).toBe(false);
    expect(days.blockers[0]).toContain('3 of 5');
    const cons = payoutEligibility(4_000, { bestDayProfit: 3_000, consistencyPct: 50 });
    expect(cons.consistencyMet).toBe(false);
    expect(n(cons.consistencyRequiredProfit!)).toBe(6_000);
    expect(cons.blockers[0]).toContain('consistency limit');
    expect(payoutEligibility(1_000, { profitTarget: 3_000, winningDays: 2, minWinningDays: 5 }).blockers).toHaveLength(2);
  });
  it('unrequested checks are null', () => {
    expect(payoutEligibility(5_000)).toMatchObject({ eligible: true, targetMet: null, daysMet: null, consistencyMet: null });
  });
});

describe('projection', () => {
  it('days to profit', () => {
    expect(daysToProfit(2_000, 3_000, 300)).toBe(4);
    expect(daysToProfit(3_000, 3_000, 300)).toBe(0);
    expect(daysToProfit(4_000, 3_000, 300)).toBe(0);
    expect(daysToProfit(2_000, 3_000, 0)).toBe(Infinity);
    expect(daysToProfit(2_000, 3_000, -100)).toBe(Infinity);
  });
  it('binding constraints', () => {
    const t = payoutProjection(1_000, 500, { profitTarget: 3_000, winningDays: 4, minWinningDays: 5 });
    expect(t).toMatchObject({ daysToTarget: 4, daysToMinDays: 1, tradingDays: 4, bindingConstraint: 'profit_target' });
    expect(n(t.projectedProfit)).toBe(3_000);
    const w = payoutProjection(2_800, 500, { profitTarget: 3_000, winningDays: 1, minWinningDays: 5 });
    expect(w).toMatchObject({ daysToTarget: 1, tradingDays: 4, bindingConstraint: 'winning_days' });
    const c = payoutProjection(2_000, 500, { profitTarget: 3_000, bestDayProfit: 3_000, consistencyPct: 50 });
    expect(c).toMatchObject({ daysToTarget: 2, daysToConsistency: 8, tradingDays: 8, bindingConstraint: 'consistency' });
    expect(n(c.projectedProfit)).toBe(6_000);
  });
  it('already eligible, losing average, unrequested', () => {
    const done = payoutProjection(5_000, 500, { profitTarget: 3_000, winningDays: 6, minWinningDays: 5 });
    expect(done).toMatchObject({ tradingDays: 0, bindingConstraint: null });
    expect(n(done.projectedProfit)).toBe(5_000);
    const losing = payoutProjection(5_000, -200, { winningDays: 1, minWinningDays: 5 });
    expect(losing).toMatchObject({ daysToMinDays: Infinity, tradingDays: Infinity, bindingConstraint: 'winning_days' });
    expect(n(losing.projectedProfit)).toBe(Infinity);
    expect(payoutProjection(1_000, 500, { profitTarget: 3_000 })).toMatchObject({ daysToMinDays: null, daysToConsistency: null });
    expect(payoutProjection(1_000, 500)).toMatchObject({ tradingDays: 0, bindingConstraint: null });
  });
});

describe('sizing', () => {
  it('pnl, ticks and risk', () => {
    expect(n(pnl(20, NQ, 3))).toBe(300);
    expect(n(pnl(8, ES))).toBe(100);
    expect(n(pnl(-12, NQ, 2))).toBe(-120);
    expect(n(pnl(40, NQ, 0))).toBe(0);
    expect(() => pnl(10, 0)).toThrow(RangeError);
    expect(() => pnl(10, NQ, -1)).toThrow(RangeError);
    expect(n(ticksToTarget(500, NQ, 2))).toBe(50);
    expect(() => ticksToTarget(500, NQ, 0)).toThrow(RangeError);
    expect(n(positionRisk(20, NQ, 3))).toBe(300);
    expect(() => positionRisk(0, NQ, 1)).toThrow(RangeError);
    expect(() => positionRisk(20, NQ, -1)).toThrow(RangeError);
  });
  it('max contracts rounds down and sizes zero without budget', () => {
    expect(maxContracts(500, 20, NQ)).toBe(5);
    expect(maxContracts(290, 20, NQ)).toBe(2);
    expect(maxContracts(50, 20, NQ)).toBe(0);
    expect(maxContracts(0, 20, NQ)).toBe(0);
    expect(maxContracts(-500, 20, NQ)).toBe(0);
    expect(() => maxContracts(500, 20, 0)).toThrow(RangeError);
    expect(() => maxContracts(500, 0, NQ)).toThrow(RangeError);
  });
  it('sizes against the floor, not the balance', () => {
    const base = { currentEquity: 50_500, startingBalance: 50_000, maxDrawdown: 2_000, peakEquity: 51_000, stopTicks: 20, tickValue: NQ };
    expect(maxContractsFromCushion(base)).toBe(15);
    expect(maxContractsFromCushion({ ...base, riskPct: 20 })).toBe(3);
    expect(maxContractsFromCushion({ ...base, currentEquity: 48_900 })).toBe(0);
    expect(maxContractsFromCushion({ ...base, currentEquity: 50_000, peakEquity: 53_000, ddType: 'static' })).toBe(20);
    for (const bad of [0, -10, 101]) expect(() => maxContractsFromCushion({ ...base, riskPct: bad })).toThrow(RangeError);
  });
  it('r multiple and the stop-out identity', () => {
    expect(n(rMultiple(300, 100))).toBe(3);
    expect(n(rMultiple(-100, 100))).toBe(-1);
    expect(() => rMultiple(300, 0)).toThrow(RangeError);
    const contracts = maxContracts(500, 20, NQ);
    expect(n(pnl(-20, NQ, contracts))).toBe(-500);
    expect(n(positionRisk(20, NQ, contracts))).toBe(500);
  });
});
