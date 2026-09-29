import { describe, expect, it } from 'vitest';

import { addPayout, applyDays, applyImport, type Account, type DayEntry } from '../src/account.ts';
import { payoutCalendar } from '../src/calendar.ts';
import type { StageRules } from '../src/catalog/types.ts';
import { evaluate } from '../src/evaluate.ts';

const n = (value: { toNumber(): number }) => value.toNumber();

function rules(overrides: Partial<StageRules> = {}): StageRules {
  return {
    stage: 'eval',
    name: 'Test eval',
    drawdown: { amount: '2000', mode: 'eod_trailing', lockAt: 'start' },
    source: { url: 'https://example.com', checkedAt: '2026-09-01' },
    ...overrides,
  };
}

function account(stageRules: StageRules, days: Array<[string, number]> = [], extra: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    label: 'Test 50K',
    firmId: 'test',
    planId: 'test/plan/50000',
    stage: stageRules.stage,
    rules: stageRules,
    catalogVersion: '2026-09-01',
    startingBalance: '50000',
    feePerSide: '0',
    days: days.map(([date, pnl]): DayEntry => ({ date, pnl: String(pnl), source: 'manual' })),
    payouts: [],
    externalIds: [],
    included: true,
    ...extra,
  };
}

describe('drawdown walk', () => {
  it('reads days in date order whatever order they are stored in', () => {
    const ordered = evaluate(account(rules(), [['2026-09-01', 1500], ['2026-09-02', -3000]]));
    const shuffled = evaluate(account(rules(), [['2026-09-02', -3000], ['2026-09-01', 1500]]));
    expect(shuffled.blown).toEqual(ordered.blown);
    expect(ordered.blown).toEqual({ date: '2026-09-02', reason: 'drawdown' });
  });

  it('checks each day against the floor set by earlier days only', () => {
    const status = evaluate(account(rules(), [['2026-09-01', 1000], ['2026-09-02', -2900]]));
    expect(n(status.floor)).toBe(49_000);
    expect(status.blown).toEqual({ date: '2026-09-02', reason: 'drawdown' });
  });

  it('stops trailing at the lock level, or never when told', () => {
    const days: Array<[string, number]> = [['2026-09-01', 3000], ['2026-09-02', 2000]];
    expect(n(evaluate(account(rules(), days)).floor)).toBe(50_000);
    expect(n(evaluate(account(rules({ drawdown: { amount: '2000', mode: 'eod_trailing', lockAt: { aboveStart: '100' } } }), days)).floor)).toBe(50_100);
    expect(n(evaluate(account(rules({ drawdown: { amount: '2000', mode: 'intraday_trailing', lockAt: 'never' } }), days)).floor)).toBe(53_000);
  });

  it('keeps a static floor still', () => {
    const status = evaluate(account(rules({ drawdown: { amount: '2000', mode: 'static', lockAt: 'start' } }), [['2026-09-01', 5000]]));
    expect(n(status.floor)).toBe(48_000);
  });

  it('counts touching the floor as a breach and never recovers', () => {
    const status = evaluate(account(rules({ profitTarget: '3000' }), [['2026-09-01', -2000], ['2026-09-02', 4000]]));
    expect(status.blown).toEqual({ date: '2026-09-01', reason: 'drawdown' });
    expect(status.evaluation?.passed).toBe(false);
  });

  it('only fails the account on a breach-type daily loss', () => {
    const days: Array<[string, number]> = [['2026-09-01', -1200]];
    const lock = evaluate(account(rules({ dailyLoss: { amount: '1000', effect: 'session_lock' } }), days));
    const breach = evaluate(account(rules({ dailyLoss: { amount: '1000', effect: 'breach' } }), days));
    expect(lock.blown).toBeNull();
    expect(lock.dailyLoss?.hits).toEqual(['2026-09-01']);
    expect(breach.blown).toEqual({ date: '2026-09-01', reason: 'daily_loss' });
  });

  it('charges the account fee on sides the file had no fees for', () => {
    const acc = account(rules(), [], { feePerSide: '2.5' });
    acc.days = [{ date: '2026-09-01', pnl: '500', source: 'import:topstepx-orders', sidesWithoutFees: 4 }];
    expect(n(evaluate(acc).totalProfit)).toBe(490);
  });

  it('handles an account with no days', () => {
    const status = evaluate(account(rules({ profitTarget: '3000' })));
    expect(status.bestDay).toBeNull();
    expect(n(status.balance)).toBe(50_000);
    expect(status.evaluation?.passed).toBe(false);
  });
});

describe('consistency on an evaluation', () => {
  const evalRules = rules({
    profitTarget: '3000',
    consistency: { pct: '50', basis: 'total_profit', effect: 'raises_target' },
  });

  it('raises the target instead of failing', () => {
    const status = evaluate(account(evalRules, [['2026-09-01', 2500], ['2026-09-02', 600]]));
    expect(n(status.evaluation!.effectiveTarget!)).toBe(5_000);
    expect(status.evaluation!.passed).toBe(false);
    expect(status.blown).toBeNull();
  });

  it('passes once profit covers the raised target', () => {
    const status = evaluate(account(evalRules, [['2026-09-01', 2500], ['2026-09-02', 1500], ['2026-09-03', 1100]]));
    expect(status.evaluation!.passed).toBe(true);
  });

  it('never reads zero or negative profit as consistent', () => {
    const status = evaluate(account(evalRules, [['2026-09-01', -300]]));
    expect(status.consistency!.ok).toBe(false);
  });

  it('cannot be fixed with more profit when the cap is a share of the target', () => {
    const capped = rules({ profitTarget: '3000', consistency: { pct: '50', basis: 'profit_target', effect: 'blocks_payout' } });
    const status = evaluate(account(capped, [['2026-09-01', 2000], ['2026-09-02', 1500]]));
    expect(status.consistency!.requiredTotal).toBeNull();
    expect(status.evaluation!.passed).toBe(false);
    expect(status.evaluation!.daysToPass).toBe(Infinity);
  });
});

describe('payout paths', () => {
  const funded = rules({
    stage: 'funded',
    name: 'Funded',
    payoutPaths: [
      { name: 'Standard', winningDays: { count: 5, minProfit: '150' }, split: 90, capPctOfProfit: 50, cap: '5000' },
      {
        name: 'Consistency',
        minTradingDays: 3,
        consistency: { pct: '40', basis: 'profit_since_payout', effect: 'blocks_payout', bestDay: 'resets' },
        split: 90,
        cap: '3000',
      },
    ],
  });

  it('reports the fastest path first and ranks eligible paths above blocked ones', () => {
    const status = evaluate(account(funded, [['2026-09-01', 400], ['2026-09-02', 350], ['2026-09-03', 300]]));
    expect(status.payout!.best.name).toBe('Consistency');
    expect(status.payout!.best.eligible).toBe(true);
    const standard = status.payout!.paths.find((path) => path.name === 'Standard')!;
    expect(standard.eligible).toBe(false);
    expect(standard.winningDays).toBe(3);
  });

  it('counts winning days and the consistency window only since the last payout', () => {
    let acc = account(funded, [
      ['2026-09-01', 2000],
      ['2026-09-02', 200],
      ['2026-09-03', 200],
      ['2026-09-04', 200],
      ['2026-09-07', 200],
    ]);
    acc = addPayout(acc, '2026-09-07', '1000');
    acc = applyDays(acc, [
      { date: '2026-09-08', pnl: '300', source: 'manual' },
      { date: '2026-09-09', pnl: '100', source: 'manual' },
    ]).account;
    const status = evaluate(acc);
    const standard = status.payout!.paths.find((path) => path.name === 'Standard')!;
    const consistency = status.payout!.paths.find((path) => path.name === 'Consistency')!;
    expect(standard.winningDays).toBe(1);
    expect(n(consistency.consistency!.total)).toBe(400);
    expect(n(consistency.consistency!.bestDay!.pnl)).toBe(300);
  });

  it('keeps the old best day when the firm says it carries', () => {
    const carries = rules({
      stage: 'funded',
      payoutPaths: [{ name: 'Only', consistency: { pct: '40', basis: 'profit_since_payout', effect: 'blocks_payout', bestDay: 'carries' }, split: 80 }],
    });
    let acc = account(carries, [['2026-09-01', 2000], ['2026-09-02', 500]]);
    acc = addPayout(acc, '2026-09-02', '1000');
    acc = applyDays(acc, [{ date: '2026-09-03', pnl: '400', source: 'manual' }]).account;
    const status = evaluate(acc);
    expect(n(status.payout!.best.consistency!.bestDay!.pnl)).toBe(2000);
    expect(status.payout!.best.eligible).toBe(false);
  });

  it('takes payouts off the balance without lowering the peak', () => {
    let acc = account(funded, [['2026-09-01', 3000]]);
    acc = addPayout(acc, '2026-09-01', '1000');
    const status = evaluate(acc);
    expect(n(status.balance)).toBe(52_000);
    expect(n(status.peak)).toBe(53_000);
    expect(n(status.floor)).toBe(50_000);
  });

  it('moves the floor to its post-payout level only after a payout', () => {
    const locking = rules({
      stage: 'funded',
      drawdown: { amount: '2000', mode: 'eod_trailing', lockAt: 'start', afterFirstPayout: { floorAboveStart: '100' } },
      payoutPaths: [{ name: 'Only', split: 90 }],
    });
    const before = evaluate(account(locking, [['2026-09-01', 1000]]));
    expect(n(before.floor)).toBe(49_000);
    const after = evaluate(addPayout(account(locking, [['2026-09-01', 1000]]), '2026-09-01', '500'));
    expect(n(after.floor)).toBe(50_100);
  });

  it('never projects a payout on a zero or negative average day', () => {
    const status = evaluate(account(funded, [['2026-09-01', 200]]), { avgDay: 0 });
    for (const path of status.payout!.paths) expect(path.daysToEligible).toBe(Infinity);
  });
});

describe('what-if and imports', () => {
  it('does not change the stored account', () => {
    const acc = account(rules({ profitTarget: '3000' }), [['2026-09-01', 1000]]);
    const copy = structuredClone(acc);
    const status = evaluate(acc, { whatIf: -2500, today: '2026-09-01' });
    expect(status.whatIf).toEqual({ date: '2026-09-02', pnl: expect.anything() });
    expect(status.blown?.date).toBe('2026-09-02');
    expect(acc).toEqual(copy);
  });

  it('replaces the days an import covers and reports them', () => {
    const acc = account(rules(), [['2026-09-01', 100], ['2026-09-02', 200]]);
    const result = applyImport(
      acc,
      { externalId: 'X1', days: [{ date: '2026-09-02', pnl: '250', sidesWithoutFees: 0 }, { date: '2026-09-03', pnl: '50', sidesWithoutFees: 0 }], payouts: [{ date: '2026-09-03', amount: '100' }] },
      'tradovate-balance-history',
    );
    expect(result.replaced).toEqual(['2026-09-02']);
    expect(result.added).toEqual(['2026-09-03']);
    expect(result.account.days.map((day) => day.pnl)).toEqual(['100', '250', '50']);
    expect(result.account.externalIds).toEqual(['X1']);
    const again = applyImport(result.account, { externalId: 'X1', days: [], payouts: [{ date: '2026-09-03', amount: '100' }] }, 'tradovate-cash-history');
    expect(again.payoutsAdded).toBe(0);
  });
});

describe('payout calendar', () => {
  it('schedules repeated payouts by simulating the average day', () => {
    const funded = rules({ stage: 'funded', payoutPaths: [{ name: 'Weekly', winningDays: { count: 5, minProfit: '150' }, split: 90, capPctOfProfit: 50 }] });
    const calendar = payoutCalendar([account(funded, [['2026-09-01', 300]])], { today: '2026-09-01', horizonDays: 20, avgDay: { a1: 300 } });
    const [first, second] = calendar.events;
    expect([first!.date, n(first!.amount)]).toEqual(['2026-09-07', 675]);
    expect([second!.date, n(second!.amount)]).toEqual(['2026-09-14', 1012.5]);
    expect(calendar.weeks[0]!.week).toBe('2026-09-07');
    expect(calendar.unreachable).toEqual([]);
  });

  it('lists accounts it cannot schedule instead of inventing dates', () => {
    const calendar = payoutCalendar([account(rules({ profitTarget: '3000' }), [['2026-09-01', -100]])], { today: '2026-09-01' });
    expect(calendar.events).toEqual([]);
    expect(calendar.unreachable[0]!.reason).toContain('average');
  });
});

describe('consistency measured against the profit target', () => {
  it('is fine while the best day stays under its share of the target, whatever the total', () => {
    const topstepLike = rules({ profitTarget: '3000', consistency: { pct: '50', basis: 'profit_target', effect: 'raises_target' } });
    const status = evaluate(account(topstepLike, [['2026-09-01', 160], ['2026-09-02', 100]]));
    expect(status.consistency!.ok).toBe(true);
    expect(n(status.evaluation!.effectiveTarget!)).toBe(3000);
  });

  it('raises the target once the best day passes that share', () => {
    const topstepLike = rules({ profitTarget: '3000', consistency: { pct: '50', basis: 'profit_target', effect: 'raises_target' } });
    const status = evaluate(account(topstepLike, [['2026-09-01', 2000], ['2026-09-02', 500]]));
    expect(status.consistency!.ok).toBe(false);
    expect(n(status.evaluation!.effectiveTarget!)).toBe(4000);
  });
});

describe('findings from the engine review', () => {
  it('never offers a payout that takes the balance under the floor', () => {
    const lightningLike = rules({
      stage: 'funded',
      drawdown: { amount: '2000', mode: 'eod_trailing', lockAt: { aboveStart: '100' } },
      payoutPaths: [{ name: 'Only', minProfit: '3000', split: 90 }],
    });
    const acc = account(lightningLike, [
      ['2026-09-01', 600],
      ['2026-09-02', 600],
      ['2026-09-03', 600],
      ['2026-09-04', 600],
      ['2026-09-07', 600],
    ]);
    const status = evaluate(acc);
    expect(n(status.floor)).toBe(50_100);
    expect(n(status.payout!.best.withdrawable)).toBe(2_900);
    const after = evaluate(applyDays(addPayout(acc, '2026-09-07', status.payout!.best.withdrawable), [{ date: '2026-09-08', pnl: '50', source: 'manual' }]).account);
    expect(after.blown).toBeNull();
  });

  it('keeps room for a floor that jumps up after the first payout', () => {
    const jumps = rules({
      stage: 'funded',
      drawdown: { amount: '2000', mode: 'eod_trailing', lockAt: 'start', afterFirstPayout: { floorAboveStart: '100' } },
      payoutPaths: [{ name: 'Only', split: 90 }],
    });
    const status = evaluate(account(jumps, [['2026-09-01', 1000]]));
    expect(n(status.payout!.best.withdrawable)).toBe(900);
  });

  it('counts the consistency shortfall when an evaluation is blocked rather than raised', () => {
    const blocked = rules({ profitTarget: '3000', consistency: { pct: '40', basis: 'total_profit', effect: 'blocks_payout' } });
    const status = evaluate(account(blocked, [['2026-09-01', 2000], ['2026-09-02', 1000], ['2026-09-03', 200]]), { avgDay: 200 });
    expect(status.evaluation!.passed).toBe(false);
    expect(status.evaluation!.daysToPass).toBe(9);
  });

  it('stops projecting at the horizon even with a tiny average day', () => {
    const slow = rules({ profitTarget: '3000' });
    const started = performance.now();
    const calendar = payoutCalendar([account(slow, [['2026-09-01', 10]])], { today: '2026-09-01', avgDay: { a1: '0.01' } });
    expect(performance.now() - started).toBeLessThan(500);
    expect(calendar.events).toEqual([]);
  });

  it('says what each drawdown check can and cannot see', () => {
    const intraday = rules({ drawdown: { amount: '2000', mode: 'intraday_trailing', lockAt: 'start' } });
    expect(evaluate(account(intraday)).notes.join(' ')).toContain('open profit');
    expect(evaluate(account(rules(), [['2026-09-01', 100]])).notes[0]).toContain('during the day');
  });
});

describe('a buffer that gates only the first payout', () => {
  const eodLike = rules({
    stage: 'funded',
    drawdown: { amount: '2000', mode: 'eod_trailing', lockAt: { aboveStart: '100' } },
    payoutPaths: [{ name: 'Only', minProfit: '500', minRequest: '500', split: 90, buffer: { kind: 'balance_to_request', amount: '52100', firstPayoutOnly: true } }],
  });

  it('holds the first payout until the balance reaches it', () => {
    const status = evaluate(account(eodLike, [['2026-09-01', 900], ['2026-09-02', 900]]));
    expect(status.payout!.best.eligible).toBe(false);
    expect(status.payout!.best.blockers[0]).toContain('$52,100.00');
  });

  it('stops gating once a payout has been taken', () => {
    let acc = account(eodLike, [['2026-09-01', 1500], ['2026-09-02', 1500]]);
    acc = addPayout(acc, '2026-09-02', '800');
    acc = applyDays(acc, [{ date: '2026-09-03', pnl: '600', source: 'manual' }]).account;
    expect(evaluate(acc).payout!.best.eligible).toBe(true);
  });
});

describe('payout paths gated by calendar days and by use count', () => {
  const proLike = rules({
    stage: 'funded',
    payoutPaths: [{ name: 'Standard', minRequest: '1000', split: 80, calendarDaysAfterFirstTrade: 14 }],
  });

  it('holds the payout until 14 calendar days after the first trade, weekends included', () => {
    const acc = account(proLike, [['2026-09-01', 1500], ['2026-09-02', 500]]);
    const early = evaluate(acc, { today: '2026-09-14', avgDay: 100 });
    expect(early.payout!.best.eligible).toBe(false);
    expect(early.payout!.best.blockers[0]).toContain('2026-09-15');
    expect(early.payout!.best.daysToEligible).toBe(1);
    expect(evaluate(acc, { today: '2026-09-15' }).payout!.best.eligible).toBe(true);
  });

  it('closes a one-time path once a payout has been taken', () => {
    const oneTime = rules({ stage: 'funded', payoutPaths: [{ name: 'Early', split: 60, capPctOfProfit: 60, maxPayouts: 1 }] });
    const acc = account(oneTime, [['2026-09-01', 1000]]);
    expect(evaluate(acc, { today: '2026-09-01' }).payout!.best.eligible).toBe(true);
    const used = evaluate(addPayout(acc, '2026-09-01', '600'), { today: '2026-09-02' });
    expect(used.payout!.best.eligible).toBe(false);
    expect(used.payout!.best.daysToEligible).toBe(Infinity);
  });

  it('closes an inside-the-buffer path once the balance reaches the buffer', () => {
    const inBuffer = rules({ stage: 'funded', payoutPaths: [{ name: 'Inside buffer', split: 80, capPctOfProfit: 60, closesAtBalance: '52100' }] });
    expect(evaluate(account(inBuffer, [['2026-09-01', 2000]]), { today: '2026-09-01' }).payout!.best.eligible).toBe(true);
    const cleared = evaluate(account(inBuffer, [['2026-09-01', 2100]]), { today: '2026-09-01' }).payout!.best;
    expect(cleared.eligible).toBe(false);
    expect(cleared.daysToEligible).toBe(Infinity);
  });
});

describe('LuxAlgo review follow-ups', () => {
  it('caps a what-if day at a session-lock daily loss, because the firm flattens you there', () => {
    const locking = rules({ dailyLoss: { amount: '1000', effect: 'session_lock' } });
    const status = evaluate(account(locking, [['2026-09-01', 500]]), { whatIf: -3000, today: '2026-09-01' });
    expect(n(status.whatIf!.pnl)).toBe(-1000);
    expect(status.blown).toBeNull();
    expect(status.notes.some((note) => note.includes('capped'))).toBe(true);
  });

  it('does not cap a breach-type daily loss', () => {
    const breaching = rules({ dailyLoss: { amount: '1000', effect: 'breach' } });
    const status = evaluate(account(breaching, [['2026-09-01', 500]]), { whatIf: -3000, today: '2026-09-01' });
    expect(n(status.whatIf!.pnl)).toBe(-3000);
    expect(status.blown?.reason).toBe('daily_loss');
  });

  it('skips exchange holidays when counting trading days', async () => {
    const { addTradingDays, isTradingDay } = await import('../src/dates.ts');
    expect(isTradingDay('2026-04-03')).toBe(false);
    expect(isTradingDay('2026-12-25')).toBe(false);
    expect(isTradingDay('2027-12-24')).toBe(false);
    expect(isTradingDay('2028-01-03')).toBe(true);
    expect(addTradingDays('2026-04-02', 1)).toBe('2026-04-06');
  });
});

describe('a floor enforced during the day', () => {
  const intradayBreach = rules({ drawdown: { amount: '2000', mode: 'eod_trailing', lockAt: 'start' }, profitTarget: '3000' });
  const withLow = (low: string, pnl: string, rule = intradayBreach): Account => {
    const acc = account(rule);
    acc.days = [{ date: '2026-09-01', pnl, low, source: 'import:tradovate-performance', sidesWithoutFees: 4 }];
    acc.feePerSide = '0.5';
    return acc;
  };

  it('fails a day that dipped through the floor and closed above it', () => {
    expect(evaluate(withLow('-2000', '-100')).blown).toEqual({ date: '2026-09-01', reason: 'drawdown' });
  });

  it('counts fees against the low, so a dip to one cent above the floor still fails', () => {
    expect(evaluate(withLow('-1999.99', '-100')).blown?.reason).toBe('drawdown');
    expect(evaluate(withLow('-1997.99', '-100')).blown).toBeNull();
  });

  it('flags a daily loss hit from the low even when the close recovered', () => {
    const locking = rules({ drawdown: { amount: '3000', mode: 'eod_trailing', lockAt: 'start' }, dailyLoss: { amount: '1000', effect: 'session_lock' } });
    expect(evaluate(withLow('-1200', '200', locking)).dailyLoss!.hits).toEqual(['2026-09-01']);
  });
});
