import { Decimal, money, type Money, type MoneyInput } from './money.ts';

export const DRAWDOWN_TYPES = ['trailing', 'eod_trailing', 'static'] as const;
export type DrawdownType = (typeof DRAWDOWN_TYPES)[number];

export function drawdownFloor(
  startingBalance: MoneyInput,
  maxDrawdown: MoneyInput,
  peakEquity: MoneyInput,
  ddType: DrawdownType = 'trailing',
  lockAt?: MoneyInput,
): Money {
  if (!DRAWDOWN_TYPES.includes(ddType)) {
    throw new RangeError(`ddType must be one of ${DRAWDOWN_TYPES.join(', ')}, got "${ddType}"`);
  }
  const dd = money(maxDrawdown);
  if (dd.isNegative()) throw new RangeError('maxDrawdown must be a positive dollar amount');
  const start = money(startingBalance);
  if (ddType === 'static') return start.minus(dd);
  const cap = lockAt === undefined ? start : money(lockAt);
  return Decimal.min(money(peakEquity).minus(dd), cap);
}

export function isBlown(
  currentEquity: MoneyInput,
  startingBalance: MoneyInput,
  maxDrawdown: MoneyInput,
  peakEquity: MoneyInput,
  ddType: DrawdownType = 'trailing',
  lockAt?: MoneyInput,
): boolean {
  return money(currentEquity).lte(drawdownFloor(startingBalance, maxDrawdown, peakEquity, ddType, lockAt));
}

export function cushion(
  currentEquity: MoneyInput,
  startingBalance: MoneyInput,
  maxDrawdown: MoneyInput,
  peakEquity: MoneyInput,
  ddType: DrawdownType = 'trailing',
  lockAt?: MoneyInput,
): Money {
  return money(currentEquity).minus(drawdownFloor(startingBalance, maxDrawdown, peakEquity, ddType, lockAt));
}
