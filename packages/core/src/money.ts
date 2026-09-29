import { Decimal } from 'decimal.js';

export { Decimal };
export type Money = Decimal;
export type MoneyInput = Decimal.Value;

export const ZERO = new Decimal(0);

export function money(value: MoneyInput): Money {
  return new Decimal(value);
}

export function sum(values: readonly Money[]): Money {
  return values.reduce((total, value) => total.plus(value), ZERO);
}

export function max(values: readonly Money[]): Money | null {
  return values.length === 0 ? null : Decimal.max(...values);
}

export function formatMoney(value: Money): string {
  const sign = value.isNegative() ? '-' : '';
  const [whole, cents] = value.abs().toFixed(2).split('.');
  return `${sign}$${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
}
