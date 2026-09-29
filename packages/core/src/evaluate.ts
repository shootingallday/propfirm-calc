import { netPnl, type Account, type DayEntry } from './account.ts';
import type { ConsistencyRule, DrawdownRule, PayoutPath } from './catalog/types.ts';
import { bestDayPct } from './consistency.ts';
import { addTradingDays, todayIso } from './dates.ts';
import { Decimal, formatMoney, money, sum, ZERO, type Money, type MoneyInput } from './money.ts';
import { daysToProfit } from './projection.ts';

export type EvaluateOptions = {
  whatIf?: MoneyInput;
  whatIfDate?: string;
  avgDay?: MoneyInput | null;
  today?: string;
};

export type NetDay = { date: string; pnl: Money };

export type ConsistencyStatus = {
  pct: Money;
  basis: ConsistencyRule['basis'];
  effect: ConsistencyRule['effect'];
  bestDay: NetDay | null;
  total: Money;
  bestDayPct: Money;
  ok: boolean;
  requiredTotal: Money | null;
  windowStart: string | null;
};

export type EvaluationStatus = {
  profitTarget: Money | null;
  effectiveTarget: Money | null;
  profitRemaining: Money;
  minTradingDays: number | null;
  tradingDays: number;
  passed: boolean;
  blockers: string[];
  daysToPass: number;
};

export type PathStatus = {
  name: string;
  eligible: boolean;
  blockers: string[];
  cycleProfit: Money;
  cycleStart: string | null;
  winningDays: number | null;
  winningDaysNeeded: number | null;
  consistency: ConsistencyStatus | null;
  withdrawable: Money;
  estimatedPayout: Money;
  split: number;
  daysToEligible: number;
};

export type AccountStatus = {
  accountId: string;
  startingBalance: Money;
  balance: Money;
  peak: Money;
  floor: Money;
  cushion: Money;
  blown: { date: string; reason: 'drawdown' | 'daily_loss' } | null;
  totalProfit: Money;
  totalPaidOut: Money;
  tradingDays: number;
  lastDate: string | null;
  bestDay: NetDay | null;
  avgWinningDay: Money | null;
  avgDayUsed: Money | null;
  dailyLoss: { amount: Money; effect: 'breach' | 'session_lock'; hits: string[] } | null;
  consistency: ConsistencyStatus | null;
  evaluation: EvaluationStatus | null;
  payout: { paths: PathStatus[]; best: PathStatus } | null;
  whatIf: NetDay | null;
  notes: string[];
};

const INF = money(Infinity);

function floorFor(rule: DrawdownRule, start: Money, peak: Money, paid: boolean): Money {
  if (paid && rule.afterFirstPayout) return start.plus(rule.afterFirstPayout.floorAboveStart);
  const amount = money(rule.amount);
  if (rule.mode === 'static') return start.minus(amount);
  const cap = rule.lockAt === 'start' ? start : rule.lockAt === 'never' ? INF : start.plus(rule.lockAt.aboveStart);
  return Decimal.min(peak.minus(amount), cap);
}

function bestOf(days: readonly NetDay[]): NetDay | null {
  let best: NetDay | null = null;
  for (const day of days) if (day.pnl.gt(0) && (!best || day.pnl.gt(best.pnl))) best = day;
  return best;
}

export function consistencyStatus(
  rule: ConsistencyRule,
  days: readonly NetDay[],
  lastPayout: string | null,
  profitTarget: Money | null,
): ConsistencyStatus {
  const sincePayout = rule.basis === 'profit_since_payout' && lastPayout !== null;
  const window = sincePayout ? days.filter((day) => day.date > lastPayout) : days;
  const bestDay = bestOf(rule.bestDay === 'carries' ? days : window);
  const best = bestDay?.pnl ?? ZERO;
  const total = sum(window.map((day) => day.pnl));
  const pct = money(rule.pct);
  if (rule.basis === 'profit_target' && profitTarget !== null) {
    const limit = profitTarget.times(pct).div(100);
    return {
      pct,
      basis: rule.basis,
      effect: rule.effect,
      bestDay,
      total,
      bestDayPct: bestDayPct(best, profitTarget),
      ok: best.lte(limit),
      requiredTotal: rule.effect === 'raises_target' ? best.div(pct.div(100)) : null,
      windowStart: sincePayout ? lastPayout : null,
    };
  }
  const requiredTotal = best.div(pct.div(100));
  return {
    pct,
    basis: rule.basis,
    effect: rule.effect,
    bestDay,
    total,
    bestDayPct: bestDayPct(best, total),
    ok: total.gt(0) && total.gte(requiredTotal),
    requiredTotal,
    windowStart: sincePayout ? lastPayout : null,
  };
}

function daysFor(profitNeeded: Money, avg: Money | null): number {
  if (profitNeeded.lte(0)) return 0;
  if (avg === null) return Infinity;
  return daysToProfit(0, profitNeeded, avg);
}

function pathStatus(
  path: PayoutPath,
  context: {
    start: Money;
    balance: Money;
    days: NetDay[];
    lastPayout: string | null;
    blown: boolean;
    floor: Money;
    postPayoutFloor: Money | null;
    avg: Money | null;
    profitTarget: Money | null;
  },
): PathStatus {
  const { start, balance, days, lastPayout, blown, avg } = context;
  const cycle = lastPayout === null ? days : days.filter((day) => day.date > lastPayout);
  const cycleProfit = sum(cycle.map((day) => day.pnl));
  const blockers: string[] = [];
  const counts: number[] = [];
  const profitNeeds: Money[] = [];
  if (blown) blockers.push('Account is blown');

  let winningDays: number | null = null;
  let winningDaysNeeded: number | null = null;
  if (path.winningDays) {
    const threshold = money(path.winningDays.minProfit);
    winningDays = cycle.filter((day) => day.pnl.gte(threshold)).length;
    winningDaysNeeded = path.winningDays.count;
    const remaining = Math.max(0, winningDaysNeeded - winningDays);
    if (remaining > 0) {
      blockers.push(`${winningDays} of ${winningDaysNeeded} winning days of ${formatMoney(threshold)}+`);
      counts.push(avg !== null && avg.gte(threshold) && avg.gt(0) ? remaining : Infinity);
    }
  }
  if (path.minTradingDays !== undefined && cycle.length < path.minTradingDays) {
    blockers.push(`${cycle.length} of ${path.minTradingDays} trading days this cycle`);
    counts.push(avg !== null && avg.gt(0) ? path.minTradingDays - cycle.length : Infinity);
  }
  if (path.minProfit !== undefined) {
    const need = money(path.minProfit).minus(cycleProfit);
    if (need.gt(0)) {
      blockers.push(`${formatMoney(need)} more profit this cycle (needs ${formatMoney(money(path.minProfit))})`);
      profitNeeds.push(need);
    }
  }
  const buffer = path.buffer && !(path.buffer.firstPayoutOnly && lastPayout !== null) ? path.buffer : undefined;
  if (buffer?.kind === 'balance_to_request') {
    const need = money(buffer.amount).minus(balance);
    if (need.gt(0)) {
      blockers.push(`Balance must reach ${formatMoney(money(buffer.amount))} (${formatMoney(need)} to go)`);
      profitNeeds.push(need);
    }
  }
  let consistency: ConsistencyStatus | null = null;
  if (path.consistency) {
    consistency = consistencyStatus(path.consistency, days, lastPayout, context.profitTarget);
    if (!consistency.ok) {
      const shown = consistency.bestDayPct.isFinite() ? `${consistency.bestDayPct.toFixed(0)}%` : 'no profit yet';
      blockers.push(`Best day is ${shown} against a ${consistency.pct.toFixed(0)}% consistency limit`);
      if (consistency.requiredTotal === null) counts.push(Infinity);
      else profitNeeds.push(consistency.requiredTotal.minus(consistency.total));
    }
  }

  const profitAboveStart = balance.minus(start);
  const floorForWithdrawal = Decimal.max(
    buffer?.kind === 'balance_retained' ? money(buffer.amount) : start,
    context.floor,
    context.postPayoutFloor ?? context.floor,
  );
  const limits = [balance.minus(floorForWithdrawal)];
  if (path.capPctOfProfit !== undefined) limits.push(profitAboveStart.times(path.capPctOfProfit).div(100));
  if (path.cap !== undefined) limits.push(money(path.cap));
  const withdrawable = Decimal.max(0, Decimal.min(...limits));
  if (path.minRequest !== undefined) {
    const minRequest = money(path.minRequest);
    if (withdrawable.lt(minRequest)) {
      blockers.push(`Only ${formatMoney(withdrawable)} withdrawable, minimum request is ${formatMoney(minRequest)}`);
      profitNeeds.push(floorForWithdrawal.plus(minRequest).minus(balance));
      if (path.capPctOfProfit !== undefined && path.capPctOfProfit > 0) {
        profitNeeds.push(minRequest.times(100).div(path.capPctOfProfit).minus(profitAboveStart));
      }
    }
  } else if (withdrawable.lte(0)) {
    blockers.push('Nothing withdrawable yet');
    profitNeeds.push(floorForWithdrawal.plus(1).minus(balance));
  }

  const eligible = blockers.length === 0;
  const profitDays = profitNeeds.reduce((most, need) => Math.max(most, daysFor(need, avg)), 0);
  const daysToEligible = eligible ? 0 : blown ? Infinity : Math.max(profitDays, ...counts);
  return {
    name: path.name,
    eligible,
    blockers,
    cycleProfit,
    cycleStart: lastPayout,
    winningDays,
    winningDaysNeeded,
    consistency,
    withdrawable,
    estimatedPayout: withdrawable.times(path.split).div(100),
    split: path.split,
    daysToEligible,
  };
}

function rankPaths(paths: PathStatus[]): PathStatus[] {
  return [...paths].sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      a.daysToEligible - b.daysToEligible ||
      b.estimatedPayout.comparedTo(a.estimatedPayout),
  );
}

export function withWhatIf(account: Account, pnl: MoneyInput, date?: string, today?: string): { account: Account; day: DayEntry } {
  const last = account.days.at(-1)?.date ?? null;
  const anchor = today ?? todayIso();
  const base = last !== null && last > anchor ? last : anchor;
  const day: DayEntry = { date: date ?? addTradingDays(base, 1), pnl: money(pnl).toString(), source: 'what-if' };
  const days = [...account.days.filter((existing) => existing.date !== day.date), day].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return { account: { ...account, days }, day };
}

export function evaluate(input: Account, options: EvaluateOptions = {}): AccountStatus {
  let account = input;
  let whatIf: NetDay | null = null;
  if (options.whatIf !== undefined) {
    const applied = withWhatIf(input, options.whatIf, options.whatIfDate, options.today);
    account = applied.account;
    whatIf = { date: applied.day.date, pnl: money(applied.day.pnl) };
  }
  const rules = account.rules;
  const start = money(account.startingBalance);
  const days: NetDay[] = [...account.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({ date: day.date, pnl: netPnl(day, account.feePerSide) }));
  const payouts = [...account.payouts].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(days.map((day) => [day.date, day]));
  const dates = [...new Set([...days.map((day) => day.date), ...payouts.map((payout) => payout.date)])].sort();

  let balance = start;
  let peak = start;
  let paid = false;
  let blown: AccountStatus['blown'] = null;
  const dailyHits: string[] = [];
  const dailyLimit = rules.dailyLoss ? money(rules.dailyLoss.amount) : null;

  for (const date of dates) {
    const floorBefore = floorFor(rules.drawdown, start, peak, paid);
    const day = byDate.get(date);
    if (day) {
      balance = balance.plus(day.pnl);
      const dailyHit = dailyLimit !== null && day.pnl.lte(dailyLimit.negated());
      if (dailyHit) dailyHits.push(date);
      if (!blown && dailyHit && rules.dailyLoss?.effect === 'breach') blown = { date, reason: 'daily_loss' };
      if (!blown && balance.lte(floorBefore)) blown = { date, reason: 'drawdown' };
      if (balance.gt(peak)) peak = balance;
    }
    for (const payout of payouts) {
      if (payout.date !== date) continue;
      balance = balance.minus(payout.amount);
      paid = true;
    }
  }

  const floor = floorFor(rules.drawdown, start, peak, paid);
  const totalPaidOut = sum(payouts.map((payout) => money(payout.amount)));
  const totalProfit = sum(days.map((day) => day.pnl));
  const lastPayout = payouts.at(-1)?.date ?? null;
  const winners = days.filter((day) => day.pnl.gt(0));
  const avgWinningDay = winners.length ? sum(winners.map((day) => day.pnl)).div(winners.length) : null;
  const avgDayUsed =
    options.avgDay === undefined ? avgWinningDay : options.avgDay === null ? null : money(options.avgDay);
  const profitTarget = rules.profitTarget !== undefined ? money(rules.profitTarget) : null;

  const consistency = rules.consistency ? consistencyStatus(rules.consistency, days, lastPayout, profitTarget) : null;

  let evaluation: EvaluationStatus | null = null;
  if (profitTarget !== null || rules.minTradingDays !== undefined) {
    const blockers: string[] = [];
    let effectiveTarget = profitTarget;
    if (consistency && consistency.effect === 'raises_target' && consistency.requiredTotal !== null) {
      effectiveTarget =
        effectiveTarget === null ? consistency.requiredTotal : Decimal.max(effectiveTarget, consistency.requiredTotal);
    }
    const profitRemaining = effectiveTarget === null ? ZERO : Decimal.max(0, effectiveTarget.minus(totalProfit));
    if (blown) blockers.push('Account is blown');
    if (effectiveTarget !== null && profitRemaining.gt(0)) {
      const raised = profitTarget !== null && effectiveTarget.gt(profitTarget);
      blockers.push(
        raised
          ? `${formatMoney(profitRemaining)} to go: your best day raises the target from ${formatMoney(profitTarget)} to ${formatMoney(effectiveTarget)}`
          : `${formatMoney(profitRemaining)} to the ${formatMoney(effectiveTarget)} target`,
      );
    }
    const minDays = rules.minTradingDays ?? null;
    if (minDays !== null && days.length < minDays) blockers.push(`${days.length} of ${minDays} trading days`);
    if (consistency && consistency.effect === 'blocks_payout' && !consistency.ok) {
      blockers.push(`Best day breaks the ${consistency.pct.toFixed(0)}% consistency rule`);
    }
    const passed = blockers.length === 0;
    const daysLeft = minDays === null ? 0 : Math.max(0, minDays - days.length);
    const consistencyNeed =
      consistency && consistency.effect === 'blocks_payout' && !consistency.ok && consistency.requiredTotal !== null
        ? consistency.requiredTotal.minus(consistency.total)
        : ZERO;
    const daysToPass = passed
      ? 0
      : blown || (consistency?.effect === 'blocks_payout' && !consistency.ok && consistency.requiredTotal === null)
        ? Infinity
        : Math.max(
            daysFor(Decimal.max(profitRemaining, consistencyNeed), avgDayUsed),
            daysLeft > 0 && avgDayUsed === null ? Infinity : daysLeft,
            consistencyNeed.gt(0) ? 1 : 0,
          );
    evaluation = {
      profitTarget,
      effectiveTarget,
      profitRemaining,
      minTradingDays: minDays,
      tradingDays: days.length,
      passed,
      blockers,
      daysToPass,
    };
  }

  let payout: AccountStatus['payout'] = null;
  if (rules.payoutPaths?.length) {
    const paths = rankPaths(
      rules.payoutPaths.map((path) =>
        pathStatus(path, {
          start,
          balance,
          days,
          lastPayout,
          blown: blown !== null,
          floor,
          postPayoutFloor: rules.drawdown.afterFirstPayout ? start.plus(rules.drawdown.afterFirstPayout.floorAboveStart) : null,
          avg: avgDayUsed,
          profitTarget,
        }),
      ),
    );
    payout = { paths, best: paths[0]! };
  }

  return {
    accountId: account.id,
    startingBalance: start,
    balance,
    peak,
    floor,
    cushion: balance.minus(floor),
    blown,
    totalProfit,
    totalPaidOut,
    tradingDays: days.length,
    lastDate: days.at(-1)?.date ?? null,
    bestDay: bestOf(days),
    avgWinningDay,
    avgDayUsed,
    dailyLoss: rules.dailyLoss && dailyLimit ? { amount: dailyLimit, effect: rules.dailyLoss.effect, hits: dailyHits } : null,
    consistency,
    evaluation,
    payout,
    whatIf,
    notes:
      rules.drawdown.mode === 'intraday_trailing'
        ? ['Intraday trailing drawdown, worked out from end-of-day balances. Your real floor can be higher than shown.']
        : [],
  };
}
