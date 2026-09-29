import { isoDate } from './csv.ts';

const newYork = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

const ROLL_HOUR = 18;

export function cmeTradingDay(instant: Date): string {
  const parts = new Map(newYork.formatToParts(instant).map((part) => [part.type, part.value]));
  return rolled(Number(parts.get('year')), Number(parts.get('month')), Number(parts.get('day')), Number(parts.get('hour')));
}

export function easternWallTradingDay(date: string, hour: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return rolled(year!, month!, day!, hour);
}

function rolled(year: number, month: number, day: number, hour: number): string {
  return isoDate(year, month, day + (hour >= ROLL_HOUR ? 1 : 0));
}
