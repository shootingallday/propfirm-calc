const DAY_MS = 86_400_000;

function toUtc(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError(`Expected a YYYY-MM-DD date, got "${date}"`);
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isWeekday(date: string): boolean {
  const day = toUtc(date).getUTCDay();
  return day !== 0 && day !== 6;
}

export function addTradingDays(date: string, count: number): string {
  let cursor = toUtc(date);
  let remaining = count;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (isWeekday(fromUtc(cursor))) remaining -= 1;
  }
  return fromUtc(cursor);
}

export function weekStart(date: string): string {
  const value = toUtc(date);
  const offset = (value.getUTCDay() + 6) % 7;
  return fromUtc(new Date(value.getTime() - offset * DAY_MS));
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addCalendarDays(date: string, count: number): string {
  return fromUtc(new Date(toUtc(date).getTime() + count * DAY_MS));
}

export function tradingDaysUntil(from: string, until: string): number {
  let count = 0;
  let cursor = from;
  while (cursor < until) {
    cursor = addTradingDays(cursor, 1);
    count += 1;
  }
  return count;
}
