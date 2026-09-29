import { ZERO, type Money } from '../money.ts';
import type { ImportedAccount } from './types.ts';

type Entry = { pnl: Money; at: number | null };
type Book = { days: Map<string, { entries: Entry[]; sides: number }>; payouts: Array<{ date: string; amount: Money }> };

export class Ledger {
  private readonly books = new Map<string | null, Book>();

  open(account: string | null): Book {
    let book = this.books.get(account);
    if (!book) {
      book = { days: new Map(), payouts: [] };
      this.books.set(account, book);
    }
    return book;
  }

  add(account: string | null, date: string, pnl: Money, sides: number, at: number | null = null): void {
    const days = this.open(account).days;
    const day = days.get(date) ?? { entries: [], sides: 0 };
    days.set(date, { entries: [...day.entries, { pnl, at }], sides: day.sides + sides });
  }

  payout(account: string | null, date: string, amount: Money): void {
    this.open(account).payouts.push({ date, amount });
  }

  accounts(): ImportedAccount[] {
    return [...this.books.entries()]
      .sort(([a], [b]) => (a ?? '').localeCompare(b ?? ''))
      .map(([externalId, book]) => ({
        externalId,
        days: [...book.days.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, day]) => ({
            date,
            pnl: formatAmount(day.entries.reduce((total, entry) => total.plus(entry.pnl), ZERO)),
            sidesWithoutFees: day.sides,
            ...lowOf(day.entries),
          })),
        payouts: book.payouts
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((payout) => ({ date: payout.date, amount: formatAmount(payout.amount) })),
      }));
  }
}

function lowOf(entries: readonly Entry[]): { low?: string } {
  if (entries.some((entry) => entry.at === null)) return {};
  let running = ZERO;
  let low = ZERO;
  for (const entry of [...entries].sort((a, b) => a.at! - b.at!)) {
    running = running.plus(entry.pnl);
    if (running.lt(low)) low = running;
  }
  return { low: formatAmount(low) };
}

export function formatAmount(value: Money): string {
  if (value.isZero()) return '0.00';
  return value.decimalPlaces() <= 2 ? value.toFixed(2) : value.toFixed();
}
