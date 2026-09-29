import type { Money } from 'propfirm-calc';

import { money as pxMoney, pnl as pxPnl, toneOf } from './px/format.js';

export function usd(value: Money | null | undefined, fraction?: number): string {
  if (!value || !value.isFinite()) return '—';
  return pxMoney(value.toNumber(), fraction === undefined ? {} : { fraction });
}

export function signed(value: Money, fraction?: number): string {
  return pxPnl(value.toNumber(), fraction === undefined ? {} : { fraction });
}

export function tone(value: Money): 'gain' | 'loss' | 'flat' {
  return toneOf(value.toNumber());
}

export function inDays(days: number): string {
  if (!Number.isFinite(days)) return 'not at this average';
  if (days === 0) return 'now';
  return days === 1 ? 'in 1 trading day' : `in ${days} trading days`;
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function amount(text: string, { signed = false } = {}): string | null {
  const clean = text.trim().replace(/[−–]/g, '-').replace(/[$,\s]/g, '');
  return (signed ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/).test(clean) ? clean : null;
}
