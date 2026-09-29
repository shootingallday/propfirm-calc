import { isoDate, type Wall } from './csv.ts';

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

function offsetMs(instant: number, timeZone: string): number {
  const parts = new Map(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, Number(part.value)]),
  );
  const asUtc = Date.UTC(parts.get('year')!, parts.get('month')! - 1, parts.get('day')!, parts.get('hour')!, parts.get('minute')!, parts.get('second')!);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function wallTradingDay(wall: Wall, timeZone: string): string {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const first = naive - offsetMs(naive, timeZone);
  const instant = naive - offsetMs(first, timeZone);
  return cmeTradingDay(new Date(instant));
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function rolled(year: number, month: number, day: number, hour: number): string {
  return isoDate(year, month, day + (hour >= ROLL_HOUR ? 1 : 0));
}
