import { ZERO, type Money } from '../money.ts';
import type { ImportedAccount } from './types.ts';

type Book = { days: Map<string, { pnl: Money; sides: number }>; payouts: Array<{ date: string; amount: Money }> };

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

  add(account: string | null, date: string, pnl: Money, sides: number): void {
    const days = this.open(account).days;
    const day = days.get(date) ?? { pnl: ZERO, sides: 0 };
    days.set(date, { pnl: day.pnl.plus(pnl), sides: day.sides + sides });
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
          .map(([date, day]) => ({ date, pnl: formatAmount(day.pnl), sidesWithoutFees: day.sides })),
        payouts: book.payouts
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((payout) => ({ date: payout.date, amount: formatAmount(payout.amount) })),
      }));
  }
}

export function formatAmount(value: Money): string {
  if (value.isZero()) return '0.00';
  return value.decimalPlaces() <= 2 ? value.toFixed(2) : value.toFixed();
}
