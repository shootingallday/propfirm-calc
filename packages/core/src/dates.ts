const DAY_MS = 86_400_000;

function toUtc(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError(`Expected a YYYY-MM-DD date, got "${date}"`);
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - Math.floor(b / 4) - g + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function observed(year: number, month: number, day: number): string {
  const value = new Date(Date.UTC(year, month - 1, day));
  const weekday = value.getUTCDay();
  const shift = weekday === 6 ? -1 : weekday === 0 ? 1 : 0;
  return fromUtc(new Date(value.getTime() + shift * DAY_MS));
}

export function exchangeClosures(year: number): string[] {
  return [
    ...(new Date(Date.UTC(year, 0, 1)).getUTCDay() === 6 ? [] : [observed(year, 1, 1)]),
    fromUtc(new Date(easterSunday(year).getTime() - 2 * DAY_MS)),
    observed(year, 12, 25),
  ];
}

export function isTradingDay(date: string): boolean {
  const value = toUtc(date);
  const day = value.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !exchangeClosures(value.getUTCFullYear()).includes(date);
}

export function addTradingDays(date: string, count: number): string {
  let cursor = toUtc(date);
  let remaining = count;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (isTradingDay(fromUtc(cursor))) remaining -= 1;
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
