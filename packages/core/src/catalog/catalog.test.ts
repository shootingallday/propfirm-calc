import { describe, expect, it } from 'vitest';
import { CATALOG_VERSION, FIRMS, findPlan, findStage } from './index.ts';
import type { DrawdownRule, PayoutPath, Plan, StageRules } from './types.ts';

const plans = FIRMS.flatMap((firm) => firm.plans.map((plan) => ({ firm, plan })));
const stages = plans.flatMap(({ firm, plan }) => plan.stages.map((stage) => ({ firm, plan, stage, where: `${plan.id} ${stage.stage}` })));
const paths = stages.flatMap((s) => (s.stage.payoutPaths ?? []).map((path) => ({ ...s, path, where: `${s.where} "${path.name}"` })));

const MONEY = /^(0|[1-9]\d*)(\.\d+)?$/;
const SIGNED_MONEY = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const ORDER = { eval: 0, funded: 1, live: 2 } as const;

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function moneyFields(stage: StageRules): [string, string | undefined][] {
  return [
    ['profitTarget', stage.profitTarget],
    ['drawdown.amount', stage.drawdown.amount],
    ['dailyLoss.amount', stage.dailyLoss?.amount],
    ...(stage.payoutPaths ?? []).flatMap((p): [string, string | undefined][] => [
      [`${p.name}.minProfit`, p.minProfit],
      [`${p.name}.winningDays.minProfit`, p.winningDays?.minProfit],
      [`${p.name}.buffer.amount`, p.buffer?.amount],
      [`${p.name}.minRequest`, p.minRequest],
      [`${p.name}.cap`, p.cap],
    ]),
  ];
}

function lockOffset(drawdown: DrawdownRule): string | undefined {
  return typeof drawdown.lockAt === 'object' ? drawdown.lockAt.aboveStart : undefined;
}

function pct(value: string | number): number {
  return Number(value);
}

describe('catalog identity', () => {
  it('has unique firm ids and unique plan ids', () => {
    expect(new Set(FIRMS.map((f) => f.id)).size).toBe(FIRMS.length);
    const ids = plans.map(({ plan }) => plan.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it.each(plans.map(({ firm, plan }) => [plan.id, firm.id, plan] as const))('%s belongs to its firm and names its size', (_, firmId, plan: Plan) => {
    expect(plan.firm).toBe(firmId);
    expect(plan.id.startsWith(`${firmId}/`)).toBe(true);
    expect(plan.id.endsWith(`/${plan.size}`)).toBe(true);
    expect(Number.isInteger(plan.size) && plan.size > 0).toBe(true);
    expect(plan.program.trim()).not.toBe('');
  });

  it.each(plans.map(({ plan }) => [plan.id, plan] as const))('%s has stages in lifecycle order with no repeats', (_, plan: Plan) => {
    expect(plan.stages.length).toBeGreaterThan(0);
    const order = plan.stages.map((s) => ORDER[s.stage]);
    expect(order).toEqual([...new Set(order)].sort((a, b) => a - b));
  });
});

describe('stage rules', () => {
  it.each(stages.map((s) => [s.where, s] as const))('%s writes money as plain decimals', (_, { stage }) => {
    for (const [field, value] of moneyFields(stage)) {
      if (value !== undefined) expect(value, field).toMatch(MONEY);
    }
    const lock = lockOffset(stage.drawdown);
    if (lock !== undefined) expect(lock).toMatch(SIGNED_MONEY);
    if (stage.drawdown.afterFirstPayout) expect(stage.drawdown.afterFirstPayout.floorAboveStart).toMatch(SIGNED_MONEY);
  });

  it.each(stages.map((s) => [s.where, s] as const))('%s has a drawdown the engine can run', (_, { stage, plan }) => {
    const { amount, mode, lockAt, afterFirstPayout } = stage.drawdown;
    expect(Number(amount)).toBeGreaterThan(0);
    expect(Number(amount)).toBeLessThan(plan.size);
    expect(['intraday_trailing', 'eod_trailing', 'static']).toContain(mode);
    expect(lockAt === 'start' || lockAt === 'never' || (typeof lockAt === 'object' && lockAt !== null && 'aboveStart' in lockAt)).toBe(true);
    const lock = lockOffset(stage.drawdown);
    if (lock !== undefined) {
      expect(Number(lock)).toBeLessThan(Number(amount));
      expect(Number(lock)).toBeGreaterThan(-Number(amount));
    }
    if (afterFirstPayout) {
      expect(Number(afterFirstPayout.floorAboveStart)).toBeLessThan(Number(amount));
      expect(Number(afterFirstPayout.floorAboveStart)).toBeGreaterThan(-Number(amount));
    }
  });

  it.each(stages.filter((s) => s.stage.dailyLoss).map((s) => [s.where, s] as const))('%s has a daily loss no bigger than its drawdown', (_, { stage }) => {
    expect(Number(stage.dailyLoss!.amount)).toBeGreaterThan(0);
    expect(Number(stage.dailyLoss!.amount)).toBeLessThanOrEqual(Number(stage.drawdown.amount));
    expect(['breach', 'session_lock']).toContain(stage.dailyLoss!.effect);
  });

  it.each(stages.filter((s) => s.stage.stage === 'eval').map((s) => [s.where, s] as const))('%s is an evaluation with a target and no payouts', (_, { stage, plan }) => {
    expect(stage.profitTarget).toBeDefined();
    expect(Number(stage.profitTarget)).toBeGreaterThan(0);
    expect(Number(stage.profitTarget)).toBeLessThan(plan.size);
    expect(stage.payoutPaths ?? []).toEqual([]);
  });

  it.each(stages.filter((s) => s.stage.stage !== 'eval').map((s) => [s.where, s] as const))('%s has at least one payout path', (_, { stage }) => {
    expect(stage.payoutPaths?.length ?? 0).toBeGreaterThan(0);
    const names = stage.payoutPaths!.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(stages.map((s) => [s.where, s] as const))('%s has sane counts and notes', (_, { stage }) => {
    if (stage.minTradingDays !== undefined) expect(Number.isInteger(stage.minTradingDays) && stage.minTradingDays > 0).toBe(true);
    for (const n of [stage.contracts?.minis, stage.contracts?.micros]) {
      if (n !== undefined) expect(Number.isInteger(n) && n > 0).toBe(true);
    }
    if (stage.notes !== undefined) expect(stage.notes.trim()).not.toBe('');
    expect(stage.name.trim()).not.toBe('');
  });
});

describe('consistency', () => {
  const rules = [
    ...stages.filter((s) => s.stage.consistency).map((s) => [s.where, s.stage.consistency!] as const),
    ...paths.filter((p) => p.path.consistency).map((p) => [p.where, p.path.consistency!] as const),
  ];

  it.each(rules)('%s has a percentage between 0 and 100 and a known basis and effect', (_, rule) => {
    expect(rule.pct).toMatch(MONEY);
    expect(pct(rule.pct)).toBeGreaterThan(0);
    expect(pct(rule.pct)).toBeLessThanOrEqual(100);
    expect(['total_profit', 'profit_since_payout', 'profit_target']).toContain(rule.basis);
    expect(['raises_target', 'blocks_payout']).toContain(rule.effect);
    if (rule.bestDay !== undefined) expect(rule.basis).toBe('profit_since_payout');
  });
});

describe('payout paths', () => {
  it.each(paths.map((p) => [p.where, p] as const))('%s has a split, caps and gates in range', (_, { path, plan, stage }: { path: PayoutPath; plan: Plan; stage: StageRules }) => {
    expect(path.split).toBeGreaterThan(0);
    expect(path.split).toBeLessThanOrEqual(100);
    if (path.capPctOfProfit !== undefined) {
      expect(path.capPctOfProfit).toBeGreaterThan(0);
      expect(path.capPctOfProfit).toBeLessThanOrEqual(100);
    }
    if (path.winningDays) {
      expect(Number.isInteger(path.winningDays.count) && path.winningDays.count > 0).toBe(true);
      expect(Number(path.winningDays.minProfit)).toBeGreaterThan(0);
    }
    if (path.minTradingDays !== undefined) expect(Number.isInteger(path.minTradingDays) && path.minTradingDays > 0).toBe(true);
    if (path.buffer) {
      expect(['balance_to_request', 'balance_retained']).toContain(path.buffer.kind);
      expect(stage.stage).not.toBe('live');
      expect(Number(path.buffer.amount)).toBeGreaterThan(plan.size);
    }
    if (path.cap !== undefined) expect(Number(path.cap)).toBeGreaterThan(0);
    if (path.minRequest !== undefined && path.cap !== undefined) expect(Number(path.minRequest)).toBeLessThanOrEqual(Number(path.cap));
    if (path.pxKey !== undefined) expect(path.pxKey.startsWith(`${plan.firm}/`)).toBe(true);
    if (path.notes !== undefined) expect(path.notes.trim()).not.toBe('');
  });
});

describe('sources and dates', () => {
  const today = new Date().toISOString().slice(0, 10);

  it.each(FIRMS.map((f) => [f.id, f] as const))('%s has https links and a real checked date', (_, firm) => {
    for (const url of [firm.website, firm.rulesUrl]) expect(new URL(url).protocol).toBe('https:');
    expect(isIsoDate(firm.checkedAt)).toBe(true);
    expect(firm.checkedAt <= today).toBe(true);
  });

  it.each(stages.map((s) => [s.where, s] as const))('%s cites an https source read on a real date', (_, { stage, firm, plan }) => {
    expect(new URL(stage.source.url).protocol).toBe('https:');
    expect(isIsoDate(stage.source.checkedAt)).toBe(true);
    expect(stage.source.checkedAt <= firm.checkedAt).toBe(true);
    if (stage.source.pxKey !== undefined) {
      expect(stage.source.pxKey.startsWith(`${firm.id}/`)).toBe(true);
      expect(stage.source.pxKey).toContain(`/${plan.size}/`);
    }
  });

  it('versions the catalog by its newest check', () => {
    expect(isIsoDate(CATALOG_VERSION)).toBe(true);
    expect(FIRMS.every((f) => f.checkedAt <= CATALOG_VERSION)).toBe(true);
    expect(FIRMS.some((f) => f.checkedAt === CATALOG_VERSION)).toBe(true);
  });
});

describe('lookup', () => {
  it('finds every plan and stage by id', () => {
    for (const { plan } of plans) {
      expect(findPlan(plan.id)).toBe(plan);
      for (const stage of plan.stages) expect(findStage(plan.id, stage.stage)).toBe(stage);
    }
  });

  it('returns undefined for unknown plans and missing stages', () => {
    expect(findPlan('no-such-firm/plan/1')).toBeUndefined();
    const withoutEval = plans.find(({ plan }) => !plan.stages.some((s) => s.stage === 'eval'));
    if (withoutEval) expect(findStage(withoutEval.plan.id, 'eval')).toBeUndefined();
    expect(findStage('no-such-firm/plan/1', 'funded')).toBeUndefined();
  });
});
