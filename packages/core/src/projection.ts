import { requiredProfit } from './consistency.ts';
import { money, type Money, type MoneyInput } from './money.ts';
import { targetRemaining } from './target.ts';

export type Constraint = 'profit_target' | 'winning_days' | 'consistency';

export function daysToProfit(currentProfit: MoneyInput, neededProfit: MoneyInput, avgDailyProfit: MoneyInput): number {
  const shortfall = targetRemaining(currentProfit, neededProfit);
  if (shortfall.lte(0)) return 0;
  const avg = money(avgDailyProfit);
  if (avg.lte(0)) return Infinity;
  return shortfall.div(avg).ceil().toNumber();
}

export type ProjectionInput = {
  profitTarget?: MoneyInput;
  winningDays?: number;
  minWinningDays?: number;
  bestDayProfit?: MoneyInput;
  consistencyPct?: MoneyInput;
};

export type PayoutProjection = {
  tradingDays: number;
  bindingConstraint: Constraint | null;
  projectedProfit: Money;
  daysToTarget: number | null;
  daysToMinDays: number | null;
  daysToConsistency: number | null;
};

export function payoutProjection(
  currentProfit: MoneyInput,
  avgDailyProfit: MoneyInput,
  input: ProjectionInput = {},
): PayoutProjection {
  const avg = money(avgDailyProfit);
  const daysToTarget =
    input.profitTarget === undefined ? null : daysToProfit(currentProfit, input.profitTarget, avg);
  let daysToMinDays: number | null = null;
  if (input.winningDays !== undefined && input.minWinningDays !== undefined) {
    const remaining = Math.max(0, input.minWinningDays - input.winningDays);
    daysToMinDays = remaining === 0 ? 0 : avg.lte(0) ? Infinity : remaining;
  }
  const daysToConsistency =
    input.bestDayProfit === undefined || input.consistencyPct === undefined
      ? null
      : daysToProfit(currentProfit, requiredProfit(input.bestDayProfit, input.consistencyPct), avg);
  const candidates = (
    [
      [daysToTarget, 'profit_target'],
      [daysToMinDays, 'winning_days'],
      [daysToConsistency, 'consistency'],
    ] as const
  ).filter((entry): entry is readonly [number, Constraint] => entry[0] !== null);
  const tradingDays = candidates.reduce((most, [days]) => Math.max(most, days), 0);
  const binding = tradingDays === 0 ? null : (candidates.find(([days]) => days === tradingDays)?.[1] ?? null);
  const projectedProfit = Number.isFinite(tradingDays)
    ? money(currentProfit).plus(avg.times(tradingDays))
    : money(Infinity);
  return { tradingDays, bindingConstraint: binding, projectedProfit, daysToTarget, daysToMinDays, daysToConsistency };
}
