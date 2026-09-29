import { formatMoney, type Money } from 'propfirm-calc';

export function usd(value: Money | null | undefined): string {
  if (!value) return '—';
  if (!value.isFinite()) return '—';
  return formatMoney(value).replace(/\.00$/, '');
}

export function signed(value: Money): string {
  return value.gt(0) ? `+${usd(value)}` : usd(value);
}

export function tone(value: Money): 'gain' | 'loss' | 'ink' {
  return value.gt(0) ? 'gain' : value.lt(0) ? 'loss' : 'ink';
}

export function inDays(days: number): string {
  if (!Number.isFinite(days)) return 'not at this average';
  if (days === 0) return 'now';
  return days === 1 ? 'in 1 trading day' : `in ${days} trading days`;
}
