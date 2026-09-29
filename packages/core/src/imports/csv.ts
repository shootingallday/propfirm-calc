import { money, type Money } from '../money.ts';
import { ImportError } from './types.ts';

export type Row = { line: number; field: (name: string) => string };
export type Table = { header: string[]; rows: Row[] };

export class RowProblem extends Error {}

export function readTable(text: string): Table {
  const records = splitRecords(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).filter(
    (record) => record.fields.some((field) => field.trim() !== ''),
  );
  if (records.length === 0) {
    throw new ImportError(
      'This file is empty. Tradovate exports a date range with no activity as an empty file; export a range that has trades.',
    );
  }
  const header = records[0]!.fields.map((name) => name.trim());
  if (header.length === 1 && header[0]!.toLowerCase() === 'undefined') {
    throw new ImportError(
      'This file contains only the word "undefined", which Tradovate writes when an export fails. Export the report again.',
    );
  }
  const rows = records.slice(1).map((record) => {
    if (record.fields.length !== header.length) {
      return {
        line: record.line,
        field: () => {
          throw new RowProblem(
            `this row has ${record.fields.length} fields but the header has ${header.length}`,
          );
        },
      };
    }
    const values = new Map(header.map((name, index) => [name, record.fields[index]!.trim()]));
    return { line: record.line, field: (name: string) => values.get(name) ?? '' };
  });
  return { header, rows };
}

function splitRecords(text: string): Array<{ line: number; fields: string[] }> {
  const records: Array<{ line: number; fields: string[] }> = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  const end = () => {
    fields.push(field);
    records.push({ line: start, fields });
    fields = [];
    field = '';
    start = line;
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else {
        if (character === '\n') line += 1;
        field += character;
      }
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      fields.push(field);
      field = '';
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      line += 1;
      end();
    } else field += character;
  }
  if (field !== '' || fields.length > 0) end();
  return records;
}

export function collectRows<T>(label: string, rows: readonly Row[], read: (row: Row) => T): T[] {
  const problems: string[] = [];
  const results: T[] = [];
  for (const row of rows) {
    try {
      results.push(read(row));
    } catch (error) {
      if (!(error instanceof RowProblem)) throw error;
      problems.push(`line ${row.line}: ${error.message}.`);
    }
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, 20);
    if (problems.length > shown.length) shown.push(`...and ${problems.length - shown.length} more lines with problems.`);
    throw new ImportError(`This ${label} file has rows that cannot be read:\n${shown.join('\n')}`);
  }
  return results;
}

const PLAIN = /^-?\d+(\.\d+)?$/;

export function readNumber(row: Row, name: string): Money {
  const value = row.field(name);
  if (value === '') throw new RowProblem(`${name} is blank`);
  if (!PLAIN.test(value)) throw new RowProblem(`${name} must be a plain number, not "${value}"`);
  return money(value);
}

export function readQuantity(row: Row, name: string): Money {
  const quantity = readNumber(row, name);
  if (!quantity.greaterThan(0)) throw new RowProblem(`${name} must be greater than zero, not "${row.field(name)}"`);
  return quantity;
}

export function readMoney(row: Row, name: string): Money {
  const value = row.field(name);
  if (value === '') throw new RowProblem(`${name} is blank`);
  return parseMoney(value, name);
}

export function readOptionalMoney(row: Row, name: string): Money | null {
  const value = row.field(name);
  return value === '' ? null : parseMoney(value, name);
}

function parseMoney(value: string, name: string): Money {
  const bare = value.replace(/[$,\s]/g, '');
  const bracketed = /^\(.*\)$/.test(bare);
  const inner = bracketed ? bare.slice(1, -1) : bare;
  if (!PLAIN.test(inner) || (bracketed && inner.startsWith('-'))) {
    throw new RowProblem(`${name} must be an amount of money, not "${value}"`);
  }
  const amount = money(inner);
  return bracketed ? amount.negated() : amount;
}

const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;
const US_INSTANT = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})(\.\d+)? ([+-]\d{2}:\d{2})$/;
const US_WALL = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE = /^(\d{2})\/(\d{2})\/(\d{4})(?: .*)?$/;

export function readInstant(row: Row, name: string): Date {
  const value = row.field(name);
  const us = US_INSTANT.exec(value);
  const iso = us ? `${us[3]}-${us[1]}-${us[2]}T${us[4]}:${us[5]}:${us[6]}${us[7] ?? ''}${us[8]}` : value;
  const parts = ISO_INSTANT.exec(iso);
  if (!parts) {
    throw new RowProblem(`${name} must be a date and time with its timezone, not "${value}"`);
  }
  const [year, month, day, hour, minute] = [1, 2, 3, 4, 5].map((index) => Number(parts[index]));
  const second = Number(parts[6] ?? 0);
  checkCalendar(year!, month!, day!, hour!, minute!, second, name, value);
  const millisecond = Number((parts[7] ?? '.0').slice(1).padEnd(3, '0').slice(0, 3));
  const zone = parts[8]!;
  const offset = zone.toUpperCase() === 'Z'
    ? 0
    : (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(-2))) * (zone.startsWith('+') ? 1 : -1);
  return new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, second, millisecond) - offset * 60_000);
}

export type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number; sortKey: string };

export function readWall(row: Row, name: string): Wall {
  const value = row.field(name);
  const parts = US_WALL.exec(value);
  if (!parts) throw new RowProblem(`${name} must look like 09/14/2026 09:24:03, not "${value}"`);
  const [month, day, year, hour, minute, second] = [1, 2, 3, 4, 5, 6].map((index) => Number(parts[index]));
  checkCalendar(year!, month!, day!, hour!, minute!, second!, name, value);
  const date = isoDate(year!, month!, day!);
  return {
    year: year!,
    month: month!,
    day: day!,
    hour: hour!,
    minute: minute!,
    second: second!,
    sortKey: `${date} ${String(hour).padStart(2, '0')}:${parts[5]}:${parts[6]}`,
  };
}

export function readIsoDate(row: Row, name: string): string {
  const value = row.field(name);
  const parts = ISO_DATE.exec(value);
  if (!parts) throw new RowProblem(`${name} must be a date like 2026-09-14, not "${value}"`);
  checkCalendar(Number(parts[1]), Number(parts[2]), Number(parts[3]), 0, 0, 0, name, value);
  return value;
}

export function readUsDate(row: Row, name: string): string {
  const value = row.field(name);
  const parts = US_DATE.exec(value);
  if (!parts) throw new RowProblem(`${name} must start with a date like 09/14/2026, not "${value}"`);
  const [month, day, year] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  checkCalendar(year, month, day, 0, 0, 0, name, value);
  return isoDate(year, month, day);
}

function checkCalendar(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  name: string,
  value: string,
): void {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    year < 1970 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new RowProblem(`${name} is not a real date and time: "${value}"`);
  }
}

export function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function refuseDuplicates<T>(label: string, items: readonly T[], key: (item: T) => string | null, line: (item: T) => number, idName: string): void {
  const seen = new Map<string, number>();
  const problems: string[] = [];
  for (const item of items) {
    const id = key(item);
    if (id === null) continue;
    const earlier = seen.get(id);
    if (earlier !== undefined) problems.push(`line ${line(item)}: ${idName} ${id} already appeared on line ${earlier}; an export lists each one once.`);
    else seen.set(id, line(item));
  }
  if (problems.length > 0) throw new ImportError(`This ${label} file repeats rows:\n${problems.slice(0, 20).join('\n')}`);
}
