import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { importCsv, type ImportResult } from './index.ts';

const sample = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), 'utf8');

const days = (result: ImportResult, externalId: string | null) => {
  const account = result.accounts.find((candidate) => candidate.externalId === externalId);
  if (!account) throw new Error(`no account ${externalId}`);
  return account.days.map((day) => [day.date, day.pnl, day.sidesWithoutFees]);
};

const TPT_NET = [
  ['2026-09-01', '198.00', 0],
  ['2026-09-02', '-98.00', 0],
  ['2026-09-03', '198.00', 0],
  ['2026-09-04', '18.00', 0],
  ['2026-09-08', '113.25', 0],
  ['2026-09-09', '-121.00', 0],
  ['2026-09-10', '237.00', 0],
  ['2026-09-11', '27.00', 0],
  ['2026-09-14', '23.00', 0],
  ['2026-09-15', '124.00', 0],
];

const TPT_GROSS = [
  ['2026-09-01', '200.00', 4],
  ['2026-09-02', '-95.00', 6],
  ['2026-09-03', '200.00', 4],
  ['2026-09-04', '20.00', 4],
  ['2026-09-08', '116.25', 6],
  ['2026-09-09', '-120.00', 2],
  ['2026-09-10', '240.00', 6],
  ['2026-09-11', '30.00', 6],
  ['2026-09-14', '25.00', 4],
  ['2026-09-15', '125.00', 2],
];

const MFFU_NET = [
  ['2026-09-02', '123.40', 0],
  ['2026-09-03', '-162.00', 0],
  ['2026-09-04', '196.50', 0],
  ['2026-09-08', '-123.20', 0],
  ['2026-09-09', '178.00', 0],
  ['2026-09-10', '2393.00', 0],
  ['2026-09-11', '47.40', 0],
  ['2026-09-14', '-153.50', 0],
  ['2026-09-15', '129.00', 0],
];

describe('the Tradovate samples', () => {
  it('pairs the fills of both accounts into net daily P&L', () => {
    const result = importCsv(sample('tradovate-fills.csv'));
    expect(result.layout).toBe('tradovate-fills');
    expect(result.accounts.map((account) => account.externalId)).toEqual(['MFFU50K-2', 'TPT50K-1']);
    expect(days(result, 'TPT50K-1')).toEqual(TPT_NET);
    expect(days(result, 'MFFU50K-2')).toEqual(MFFU_NET);
    expect(result.warnings).toEqual([]);
  });

  it('reads the performance report as gross P&L on one unnamed account', () => {
    const result = importCsv(sample('tradovate-performance.csv'));
    expect(result.layout).toBe('tradovate-performance');
    expect(result.accounts).toHaveLength(1);
    expect(days(result, null)).toEqual(TPT_GROSS);
  });

  it('gives the same gross days from fills with the commission blanked as from the performance report', () => {
    const fills = sample('tradovate-fills.csv')
      .split('\r\n')
      .map((line, index) => (index === 0 || line === '' ? line : line.replace(/,[^,]*$/, ',')))
      .join('\r\n');
    const fromFills = importCsv(fills);
    const fromPerformance = importCsv(sample('tradovate-performance.csv'));
    expect(days(fromFills, 'TPT50K-1')).toEqual(days(fromPerformance, null));
  });

  it('takes daily P&L from Total Realized PNL, which matches the balance changes', () => {
    const result = importCsv(sample('tradovate-balance-history.csv'));
    expect(result.layout).toBe('tradovate-balance-history');
    expect(days(result, 'TPT50K-1')).toEqual(TPT_NET);
    expect(days(result, 'MFFU50K-2')).toEqual(MFFU_NET);
    expect(result.warnings).toEqual([]);
  });

  it('sums the cash ledger into the same net days and finds the payout', () => {
    const result = importCsv(sample('tradovate-cash-history.csv'));
    expect(result.layout).toBe('tradovate-cash-history');
    expect(days(result, 'MFFU50K-2')).toEqual(MFFU_NET);
    expect(result.accounts[0]!.payouts).toEqual([{ date: '2026-09-16', amount: '1000.00' }]);
    expect(result.warnings).toEqual([]);
  });

  it('puts one outsized day on MFFU50K-2', () => {
    const pnl = MFFU_NET.map(([, value]) => Number(value));
    const total = pnl.reduce((sum, value) => sum + value, 0);
    expect(Math.max(...pnl) / total).toBeGreaterThan(0.85);
  });
});

describe('the TopstepX samples', () => {
  it('pairs filled orders into gross days, counting every filled contract as a side without fees', () => {
    const result = importCsv(sample('topstepx-orders.csv'));
    expect(result.layout).toBe('topstepx-orders');
    expect(days(result, 'TSX50K-3')).toEqual([
      ['2026-09-01', '82.00', 4],
      ['2026-09-02', '-50.00', 2],
      ['2026-09-03', '160.00', 4],
      ['2026-09-08', '-100.00', 2],
      ['2026-09-09', '150.00', 4],
      ['2026-09-10', '20.50', 2],
      ['2026-09-11', '-120.00', 6],
      ['2026-09-14', '130.00', 4],
    ]);
    expect(result.warnings).toEqual(['Skipped 18 orders that never filled (Cancelled).']);
  });

  it('reads trades net of fees and commissions, on their TradeDay', () => {
    const result = importCsv(sample('topstepx-trades.csv'));
    expect(result.layout).toBe('topstepx-trades');
    expect(days(result, null)).toEqual([
      ['2026-09-01', '79.56', 0],
      ['2026-09-02', '-51.22', 0],
      ['2026-09-03', '157.56', 0],
      ['2026-09-08', '-101.22', 0],
      ['2026-09-09', '147.56', 0],
      ['2026-09-10', '19.28', 0],
      ['2026-09-11', '-123.66', 0],
      ['2026-09-14', '127.56', 0],
    ]);
  });
});
