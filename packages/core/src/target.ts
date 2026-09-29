import { bestDayPct, consistencyOk, requiredProfit } from './consistency.ts';
import { Decimal, formatMoney, money, type Money, type MoneyInput } from './money.ts';

export function targetRemaining(currentProfit: MoneyInput, profitTarget: MoneyInput): Money {
  return Decimal.max(0, money(profitTarget).minus(currentProfit));
}

export function targetReached(currentProfit: MoneyInput, profitTarget: MoneyInput): boolean {
  return money(currentProfit).gte(profitTarget);
}

export type EligibilityInput = {
  profitTarget?: MoneyInput;
  winningDays?: number;
  minWinningDays?: number;
  bestDayProfit?: MoneyInput;
  consistencyPct?: MoneyInput;
};

export type EligibilityResult = {
  eligible: boolean;
  blockers: string[];
  targetMet: boolean | null;
  daysMet: boolean | null;
  consistencyMet: boolean | null;
  profitRemaining: Money | null;
  consistencyRequiredProfit: Money | null;
};

export function payoutEligibility(currentProfit: MoneyInput, input: EligibilityInput = {}): EligibilityResult {
  const blockers: string[] = [];
  let targetMet: boolean | null = null;
  let profitRemaining: Money | null = null;
  if (input.profitTarget !== undefined) {
    targetMet = targetReached(currentProfit, input.profitTarget);
    profitRemaining = targetRemaining(currentProfit, input.profitTarget);
    if (!targetMet) {
      blockers.push(
        `Profit ${formatMoney(money(currentProfit))} below target ${formatMoney(money(input.profitTarget))} (${formatMoney(profitRemaining)} to go)`,
      );
    }
  }
  let daysMet: boolean | null = null;
  if (input.winningDays !== undefined && input.minWinningDays !== undefined) {
    daysMet = input.winningDays >= input.minWinningDays;
    if (!daysMet) blockers.push(`${input.winningDays} of ${input.minWinningDays} required winning days`);
  }
  let consistencyMet: boolean | null = null;
  let consistencyRequiredProfit: Money | null = null;
  if (input.bestDayProfit !== undefined && input.consistencyPct !== undefined) {
    consistencyMet = consistencyOk(input.bestDayProfit, currentProfit, input.consistencyPct);
    consistencyRequiredProfit = requiredProfit(input.bestDayProfit, input.consistencyPct);
    if (!consistencyMet) {
      const pct = bestDayPct(input.bestDayProfit, currentProfit);
      const shown = pct.isFinite() ? `${pct.toFixed(0)}%` : '∞';
      blockers.push(`Best day ${shown} over the ${money(input.consistencyPct).toFixed(0)}% consistency limit`);
    }
  }
  return {
    eligible: blockers.length === 0,
    blockers,
    targetMet,
    daysMet,
    consistencyMet,
    profitRemaining,
    consistencyRequiredProfit,
  };
}
