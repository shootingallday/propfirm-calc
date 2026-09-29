import { Decimal, ZERO, type Money } from '../money.ts';
import { pointValue } from './contracts.ts';
import type { Ledger } from './ledger.ts';
import { cmeTradingDay } from './trading-day.ts';

export type Fill = {
  line: number;
  id: string;
  account: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: Money;
  price: Money;
  at: Date;
  fee: Money | null;
};

type Share = { date: string; pnl: Money; sides: number };

export function pairFills(fills: readonly Fill[], ledger: Ledger): string[] {
  const groups = new Map<string, Fill[]>();
  for (const fill of fills) {
    const key = `${fill.account}\u0000${fill.symbol}`;
    groups.set(key, [...(groups.get(key) ?? []), fill]);
    ledger.open(fill.account);
  }
  const warnings: string[] = [];
  for (const key of [...groups.keys()].sort()) {
    const warning = pairPosition(groups.get(key)!, ledger);
    if (warning) warnings.push(warning);
  }
  return warnings;
}

function pairPosition(fills: Fill[], ledger: Ledger): string | null {
  const { account, symbol } = fills[0]!;
  const value = pointValue(symbol);
  const ordered = [...fills].sort((a, b) => a.at.getTime() - b.at.getTime() || compareIds(a.id, b.id));
  const lots: Array<{ quantity: Money; price: Money }> = [];
  let direction = 0;
  let shares: Share[] = [];
  let lines = new Set<number>();
  let openedOn = '';

  for (const fill of ordered) {
    const sign = fill.side === 'buy' ? 1 : -1;
    const date = cmeTradingDay(fill.at);
    const fee = fill.fee ?? ZERO;
    let remaining = fill.quantity;
    let realized = ZERO;
    lines.add(fill.line);

    if (direction !== 0 && sign !== direction) {
      while (remaining.greaterThan(0) && lots.length > 0) {
        const lot = lots[0]!;
        const matched = Decimal.min(lot.quantity, remaining);
        realized = realized.plus(fill.price.minus(lot.price).times(matched).times(value).times(direction));
        lot.quantity = lot.quantity.minus(matched);
        if (lot.quantity.isZero()) lots.shift();
        remaining = remaining.minus(matched);
      }
    }

    const closed = fill.quantity.minus(remaining);
    const closingFee = fee.times(closed).dividedBy(fill.quantity).toDecimalPlaces(4);
    if (closed.greaterThan(0)) {
      shares.push({ date, pnl: realized.minus(closingFee), sides: fill.fee === null ? closed.toNumber() : 0 });
      if (lots.length === 0) {
        for (const share of shares) ledger.add(account, share.date, share.pnl, share.sides);
        shares = [];
        lines = remaining.greaterThan(0) ? new Set([fill.line]) : new Set();
        direction = 0;
      }
    }
    if (remaining.greaterThan(0)) {
      if (direction === 0) {
        direction = sign;
        openedOn = date;
      }
      lots.push({ quantity: remaining, price: fill.price });
      const openingFee = fee.minus(closingFee);
      if (fill.fee === null || !openingFee.isZero()) {
        shares.push({ date, pnl: openingFee.negated(), sides: fill.fee === null ? remaining.toNumber() : 0 });
      }
    }
  }

  if (lots.length === 0) return null;
  const open = lots.reduce((total, lot) => total.plus(lot.quantity), ZERO);
  return (
    `${account} ${symbol}: ${open.toFixed()} ${direction > 0 ? 'long' : 'short'} still open at the end of the file ` +
    `(opened ${openedOn}), so the ${lines.size} fills of that position are left out.`
  );
}

function compareIds(a: string, b: string): number {
  const text = a < b ? -1 : a > b ? 1 : 0;
  return /^\d+$/.test(a) && /^\d+$/.test(b) ? a.length - b.length || text : text;
}
