import { evaluate, findPlan, FIRMS, money, type Account, type AccountStatus, type StageRules } from 'propfirm-calc';

import { inDays, shortDate, usd } from './format.ts';

export type Tone = 'gain' | 'loss' | 'warn' | undefined;

export function stageTag(account: Account, status: AccountStatus): { text: string; tone: Tone } {
  if (status.blown) return { text: 'Blown', tone: 'loss' };
  if (status.evaluation?.passed) return { text: 'Passed', tone: 'gain' };
  return { text: account.rules.name, tone: undefined };
}

export function nextStep(status: AccountStatus): { title: string; sub: string } {
  if (status.blown) {
    return {
      title: `Blown on ${shortDate(status.blown.date)}`,
      sub: status.blown.reason === 'daily_loss' ? 'Broke the daily loss limit' : 'Went under the drawdown floor',
    };
  }
  if (status.payout) {
    const best = status.payout.best;
    if (best.eligible) return { title: `Payout ready via ${best.name}`, sub: `About ${usd(best.estimatedPayout, 0)} to you` };
    return { title: `Payout ${inDays(best.daysToEligible)}`, sub: `Via ${best.name}` };
  }
  if (status.evaluation) {
    if (status.evaluation.passed) return { title: 'Passed the evaluation', sub: 'Add the funded account next' };
    return { title: `Pass ${inDays(status.evaluation.daysToPass)}`, sub: `${usd(status.evaluation.profitRemaining, 0)} still needed` };
  }
  return { title: 'No payout rules for this stage', sub: '' };
}

export function changes(before: AccountStatus, after: AccountStatus): { text: string; tone: Tone }[] {
  const out: { text: string; tone: Tone }[] = [];
  if (after.dailyLoss && after.whatIf && after.dailyLoss.effect === 'session_lock' && after.dailyLoss.hits.includes(after.whatIf.date)) out.push({ text: 'Hits the daily loss lock', tone: 'warn' });
  if (!before.blown && after.blown) out.push({ text: after.blown.reason === 'daily_loss' ? 'Breaks the daily loss limit' : 'Blows the account', tone: 'loss' });
  if (after.blown) return out;
  const beforeCons = before.consistency ?? before.payout?.best.consistency;
  const afterCons = after.consistency ?? after.payout?.best.consistency;
  if (beforeCons?.ok && afterCons && !afterCons.ok) out.push({ text: 'Breaks consistency', tone: 'loss' });
  if (beforeCons && !beforeCons.ok && afterCons?.ok) out.push({ text: 'Fixes consistency', tone: 'gain' });
  if (before.evaluation && after.evaluation && !before.evaluation.passed && after.evaluation.passed) out.push({ text: 'Passes the evaluation', tone: 'gain' });
  if (before.payout && after.payout && !before.payout.best.eligible && after.payout.best.eligible) out.push({ text: 'Unlocks a payout', tone: 'gain' });
  if (before.payout && after.payout && before.payout.best.eligible && !after.payout.best.eligible) out.push({ text: 'Loses a payout', tone: 'loss' });
  return out;
}

export function allowance(account: Account): number {
  return Number(account.rules.drawdown.amount);
}

export function roomTone(account: Account, status: AccountStatus): Tone {
  if (status.blown) return 'loss';
  return status.cushion.lt(allowance(account) * 0.625) ? 'warn' : undefined;
}

export function series(account: Account): { labels: string[]; balance: number[]; floor: number[] } {
  const labels: string[] = [];
  const balance: number[] = [];
  const floor: number[] = [];
  for (let at = 1; at <= account.days.length; at++) {
    const status = evaluate({ ...account, days: account.days.slice(0, at), payouts: account.payouts.filter((payout) => payout.date <= account.days[at - 1]!.date) });
    labels.push(shortDate(account.days[at - 1]!.date));
    balance.push(status.balance.toNumber());
    floor.push(status.floor.toNumber());
  }
  return { labels, balance, floor };
}

export function firmOf(account: Account) {
  return FIRMS.find((firm) => firm.id === account.firmId);
}

export function planName(account: Account): string {
  const plan = findPlan(account.planId);
  return plan ? `${plan.program} · ${usd(money(plan.size), 0)}` : account.planId;
}

export function drawdownText(rules: StageRules): string {
  const dd = rules.drawdown;
  const mode = dd.mode === 'eod_trailing' ? 'end-of-day trailing' : dd.mode === 'intraday_trailing' ? 'intraday trailing' : 'static';
  if (dd.mode === 'static') return `${usd(money(dd.amount), 0)} static`;
  const lock = dd.lockAt === 'start' ? 'stops at the starting balance' : dd.lockAt === 'never' ? 'never locks' : `locks at start + ${usd(money(dd.lockAt.aboveStart), 0)}`;
  return `${usd(money(dd.amount), 0)} ${mode}, ${lock}`;
}

export function consistencyText(rules: StageRules): string {
  const rule = rules.consistency;
  if (!rule) return 'None';
  const basis = rule.basis === 'profit_target' ? 'the profit target' : rule.basis === 'total_profit' ? 'total profit' : 'profit since the last payout';
  return `Best day at most ${rule.pct}% of ${basis}`;
}

export function dailyLossText(rules: StageRules): string {
  if (!rules.dailyLoss) return 'None';
  return `${usd(money(rules.dailyLoss.amount), 0)}, ${rules.dailyLoss.effect === 'breach' ? 'fails the account' : 'stops you for the day'}`;
}

export function targetText(rules: StageRules): string {
  if (!rules.profitTarget) return 'None';
  return `${usd(money(rules.profitTarget), 0)}${rules.minTradingDays ? ` · ${rules.minTradingDays} trading ${rules.minTradingDays === 1 ? 'day' : 'days'}` : ''}`;
}
