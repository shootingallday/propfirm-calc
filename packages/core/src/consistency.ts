import { money, type Money, type MoneyInput } from './money.ts';

export function bestDayPct(bestDayProfit: MoneyInput, totalProfit: MoneyInput): Money {
  const total = money(totalProfit);
  if (total.lte(0)) return money(Infinity);
  return money(bestDayProfit).div(total).times(100);
}

export function consistencyOk(bestDayProfit: MoneyInput, totalProfit: MoneyInput, consistencyPct: MoneyInput): boolean {
  if (money(totalProfit).lte(0)) return false;
  return bestDayPct(bestDayProfit, totalProfit).lte(consistencyPct);
}

export function requiredProfit(bestDayProfit: MoneyInput, consistencyPct: MoneyInput): Money {
  const pct = money(consistencyPct);
  if (pct.lte(0)) throw new RangeError('consistencyPct must be a positive percentage');
  return money(bestDayProfit).div(pct.div(100));
}
