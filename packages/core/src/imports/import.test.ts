import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ImportError, importCsv, type ImportResult } from './index.ts';
import { LAYOUTS, requiredColumns } from './layouts.ts';

const FILLS = '_id,_timestamp,_action,_qty,_price,Account,Contract,commission';
const fill = (id: number, at: string, action: 0 | 1, qty: number | string, price: number | string, extra: { account?: string; contract?: string; commission?: string } = {}) =>
  [id, at, action, qty, price, extra.account ?? 'ACC', extra.contract ?? 'MNQU6', extra.commission ?? ''].join(',');
const fills = (...rows: string[]) => [FILLS, ...rows].join('\n');

const days = (result: ImportResult, externalId: string | null = 'ACC') =>
  result.accounts.find((account) => account.externalId === externalId)!.days.map((day) => [day.date, day.pnl, day.sidesWithoutFees]);

const refusal = (text: string): string => {
  try {
    importCsv(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ImportError);
    return (error as Error).message;
  }
  throw new Error('expected the file to be refused');
};

const SIX = ['Tradovate Fills', 'TopstepX Orders', 'Tradovate Performance', 'Tradovate Account Balance History', 'Tradovate Cash History', 'TopstepX Trades'];

describe('the file itself', () => {
  it('refuses an empty file and one that is only a line break', () => {
    expect(refusal('')).toMatch(/empty/);
    expect(refusal('\r\n')).toMatch(/empty/);
  });

  it('refuses the single word "undefined" that Tradovate writes for a broken export', () => {
    expect(refusal('undefined')).toContain('"undefined"');
  });

  it('reads a byte-order mark, CRLF, padded header names, blank lines and a trailing line break', () => {
    const text = '﻿ Id , ExitedAt ,PnL,Size\r\n\r\n1,09/14/2026 10:00:00 -04:00,50,1\r\n\r\n2,09/14/2026 11:00:00 -04:00,-20,1\r\n\r\n';
    expect(days(importCsv(text), null)).toEqual([['2026-09-14', '30.00', 4]]);
  });

  it('keeps commas, doubled quotes and line breaks inside quoted fields, and still names the right line', () => {
    const text = [
      `${FILLS},note`,
      `${fill(1, '2026-09-14T14:00:00Z', 0, 1, 100)},"a, ""quoted""\nnote"`,
      `${fill(2, '2026-09-14T14:05:00Z', 1, 1, 'abc')},plain`,
    ].join('\n');
    expect(refusal(text)).toMatch(/line 4: _price must be a plain number, not "abc"/);
    const good = text.replace('abc', '110');
    expect(days(importCsv(good))).toEqual([['2026-09-14', '20.00', 2]]);
  });

  it('trims the leading space Tradovate writes and falls back to B/S when _action is blank', () => {
    const text = [
      '_id,_timestamp,_action,_qty,_price,Account,Contract,B/S',
      '1,2026-09-14 14:00:00.000Z,,1,100, ACC,MNQU6, Buy',
      '2,2026-09-14 14:05:00.000Z,,1,110, ACC,MNQU6, Sell',
    ].join('\r\n');
    expect(days(importCsv(text))).toEqual([['2026-09-14', '20.00', 2]]);
  });

  it('refuses a row with the wrong number of fields, naming the line', () => {
    expect(refusal(fills(fill(1, '2026-09-14T14:00:00Z', 0, 1, 100), '2,2026-09-14T14:05:00Z,1'))).toMatch(
      /line 3: this row has 3 fields but the header has 8/,
    );
  });

  it('refuses a header with no rows', () => {
    expect(refusal(`${FILLS}\r\n`)).toBe('This Tradovate Fills file has a header but no rows.');
  });

  it('refuses a file it does not know and lists the six exports it reads', () => {
    const message = refusal('symbol,side,quantity\nMNQU6,buy,1');
    expect(message).toContain('"symbol", "side", "quantity"');
    for (const label of SIX) expect(message).toContain(label);
  });

  it('refuses Tradovate Orders and Position History with the reason', () => {
    expect(refusal('orderId,Account,Fill Time,Avg Fill Price,Status\n1,ACC,,,Canceled')).toMatch(
      /Tradovate Orders export, which lists orders, including ones that never filled/,
    );
    expect(refusal('Position ID,Pair ID,Buy Fill ID,Sell Fill ID,P/L\n1,2,3,4,5')).toMatch(/Tradovate Position History/);
  });

  it('names every bad line at once', () => {
    const message = refusal(
      fills(fill(1, '2026-09-14T14:00:00Z', 0, 0, 100), fill(2, '2026-09-14T14:00:00Z', 1, 1, ''), fill(3, 'yesterday', 0, 1, 100)),
    );
    expect(message).toMatch(/line 2: _qty must be greater than zero/);
    expect(message).toMatch(/line 3: _price is blank/);
    expect(message).toMatch(/line 4: _timestamp must be a date and time with its timezone/);
  });

  it('matches each real sample to exactly one layout', () => {
    const folder = new URL('../../samples/', import.meta.url);
    for (const name of readdirSync(folder).filter((file) => file.endsWith('.csv'))) {
      const header = readFileSync(new URL(name, folder), 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0]!.split(',');
      const matches = LAYOUTS.filter((layout) => requiredColumns(layout.id).every((column) => header.includes(column)));
      expect(matches.map((layout) => layout.id), name).toEqual([name.replace('.csv', '')]);
    }
  });
});

describe('numbers', () => {
  const PERF = 'buyFillId,sellFillId,qty,pnl,boughtTimestamp,soldTimestamp';

  it('reads dollar signs, thousands separators and accounting brackets', () => {
    const text = [
      PERF,
      '1,2,1,"$1,234.50",09/14/2026 09:30:00,09/14/2026 09:40:00',
      '3,4,1,$(17.00),09/14/2026 10:30:00,09/14/2026 10:40:00',
      '5,6,1,-0.25,09/14/2026 11:30:00,09/14/2026 11:40:00',
    ].join('\n');
    expect(days(importCsv(text), null)).toEqual([['2026-09-14', '1217.25', 6]]);
  });

  it('refuses money that is not money', () => {
    expect(refusal(`${PERF}\n1,2,1,$12..0,09/14/2026 09:30:00,09/14/2026 09:40:00`)).toMatch(/pnl must be an amount of money/);
  });

  it('refuses exponent notation and blank prices', () => {
    expect(refusal(fills(fill(1, '2026-09-14T14:00:00Z', 0, 1, '1e5')))).toMatch(/_price must be a plain number, not "1e5"/);
    expect(refusal(fills(fill(1, '2026-09-14T14:00:00Z', 0, 1, '')))).toMatch(/_price is blank/);
  });

  it('pairs a negative price the way crude oil traded in April 2020', () => {
    const text = fills(
      fill(1, '2026-09-14T14:00:00Z', 0, 1, '-37.63', { contract: 'CLX6', commission: '0' }),
      fill(2, '2026-09-14T15:00:00Z', 1, 1, '-30.13', { contract: 'CLX6', commission: '0' }),
    );
    expect(days(importCsv(text))).toEqual([['2026-09-14', '7500.00', 0]]);
  });

  it('keeps cents exact with no float drift', () => {
    const text = fills(
      fill(1, '2026-09-14T14:00:00Z', 0, 1, 100, { commission: '0.1' }),
      fill(2, '2026-09-14T14:05:00Z', 1, 1, 101, { commission: '0.2' }),
    );
    expect(days(importCsv(text))).toEqual([['2026-09-14', '1.70', 0]]);
  });

  it('writes a scratch day as 0.00', () => {
    const text = fills(fill(1, '2026-09-14T14:00:00Z', 0, 1, 100, { commission: '0' }), fill(2, '2026-09-14T14:05:00Z', 1, 1, 100, { commission: '0' }));
    expect(days(importCsv(text))).toEqual([['2026-09-14', '0.00', 0]]);
  });
});

describe('trading days', () => {
  const trade = (open: string, close: string) =>
    days(importCsv(fills(fill(1, open, 0, 1, 100, { commission: '0' }), fill(2, close, 1, 1, 110, { commission: '0' }))));

  it('rolls to the next day at 17:00 Chicago, not a second before', () => {
    expect(trade('2026-09-14T21:00:00Z', '2026-09-14T21:59:59Z')).toEqual([['2026-09-14', '20.00', 0]]);
    expect(trade('2026-09-14T21:00:00Z', '2026-09-14T22:00:00Z')).toEqual([['2026-09-15', '20.00', 0]]);
  });

  it('puts the Sunday evening session on Monday', () => {
    expect(trade('2026-09-13T22:10:00Z', '2026-09-13T22:40:00Z')).toEqual([['2026-09-14', '20.00', 0]]);
  });

  it('moves the roll from 22:00 to 23:00 UTC when daylight saving ends', () => {
    expect(trade('2026-10-28T22:10:00Z', '2026-10-28T22:30:00Z')).toEqual([['2026-10-29', '20.00', 0]]);
    expect(trade('2026-11-04T22:10:00Z', '2026-11-04T22:30:00Z')).toEqual([['2026-11-04', '20.00', 0]]);
  });

  it('labels a Friday evening fill the way PX does, as Saturday', () => {
    expect(trade('2026-09-18T22:10:00Z', '2026-09-18T22:30:00Z')).toEqual([['2026-09-19', '20.00', 0]]);
  });

  it('reads the TopstepX offset form and refuses a timestamp with no zone', () => {
    const text = [
      'Id,AccountName,ContractName,Status,Size,Side,FilledAt,ExecutePrice',
      '1,TSX,MNQU6,Filled,1,Bid,09/14/2026 17:59:59 -04:00,100.000000000',
      '2,TSX,MNQU6,Filled,1,Ask,09/14/2026 18:00:00 -04:00,110.000000000',
    ].join('\n');
    expect(days(importCsv(text), 'TSX')).toEqual([
      ['2026-09-14', '0.00', 1],
      ['2026-09-15', '20.00', 1],
    ]);
    expect(refusal(fills(fill(1, '2026-09-14 14:00:00', 0, 1, 100)))).toMatch(/_timestamp must be a date and time with its timezone/);
  });

  it('refuses a date that is not on the calendar', () => {
    expect(refusal(fills(fill(1, '2026-02-30T14:00:00Z', 0, 1, 100)))).toMatch(/not a real date and time/);
    expect(refusal('Id,ExitedAt,PnL,Size\n1,02/30/2026 10:00:00 -05:00,5,1')).toMatch(/ExitedAt is not a real date/);
  });

  it('takes TopstepX TradeDay as written and falls back to ExitedAt when it is blank', () => {
    const text = [
      'Id,ExitedAt,PnL,Size,TradeDay,Fees,Commissions',
      '1,09/13/2026 18:45:36 -04:00,80,1,09/14/2026 00:00:00 -05:00,0.72,0.50',
      '2,09/13/2026 18:50:00 -04:00,20,1,,,',
    ].join('\n');
    expect(days(importCsv(text), null)).toEqual([['2026-09-14', '98.78', 2]]);
  });
});

describe('pairing fills', () => {
  it('sorts rows by time before pairing, whatever order the file uses', () => {
    const rows = [
      fill(30, '2026-09-14T14:10:00Z', 1, 1, 104),
      fill(10, '2026-09-14T14:00:00Z', 0, 1, 100),
      fill(20, '2026-09-14T14:05:00Z', 0, 1, 102),
      fill(40, '2026-09-14T14:15:00Z', 1, 1, 101),
    ];
    const forward = importCsv(fills(...rows));
    expect(days(forward)).toEqual([['2026-09-14', '6.00', 4]]);
    expect(importCsv(fills(...rows.reverse()))).toEqual(forward);
  });

  it('refuses the same fill id twice', () => {
    expect(refusal(fills(fill(7, '2026-09-14T14:00:00Z', 0, 1, 100), fill(7, '2026-09-14T14:05:00Z', 1, 1, 110)))).toMatch(
      /line 3: _id 7 already appeared on line 2/,
    );
  });

  it('opens a short when a sell comes before any buy', () => {
    expect(days(importCsv(fills(fill(1, '2026-09-14T14:00:00Z', 1, 1, 110), fill(2, '2026-09-14T14:05:00Z', 0, 1, 100))))).toEqual([
      ['2026-09-14', '20.00', 2],
    ]);
  });

  it('scales in at two prices and out in one fill', () => {
    const text = fills(fill(1, '2026-09-14T14:00:00Z', 0, 1, 100), fill(2, '2026-09-14T14:01:00Z', 0, 1, 102), fill(3, '2026-09-14T14:02:00Z', 1, 2, 105));
    expect(days(importCsv(text))).toEqual([['2026-09-14', '16.00', 4]]);
  });

  it('puts a runner closed the next day on that day, first in first out', () => {
    const text = fills(
      fill(1, '2026-09-14T14:00:00Z', 0, 1, 100, { contract: 'ESU6' }),
      fill(2, '2026-09-14T14:01:00Z', 0, 1, 104, { contract: 'ESU6' }),
      fill(3, '2026-09-14T15:00:00Z', 1, 1, 110, { contract: 'ESU6' }),
      fill(4, '2026-09-15T15:00:00Z', 1, 1, 90, { contract: 'ESU6' }),
    );
    expect(days(importCsv(text))).toEqual([
      ['2026-09-14', '500.00', 3],
      ['2026-09-15', '-700.00', 1],
    ]);
  });

  it('reverses through zero in one fill and splits its commission', () => {
    const text = fills(
      fill(1, '2026-09-14T14:00:00Z', 0, 1, 100, { commission: '0.5' }),
      fill(2, '2026-09-14T14:05:00Z', 1, 3, 110, { commission: '1.5' }),
      fill(3, '2026-09-14T14:10:00Z', 0, 2, 105, { commission: '1.0' }),
    );
    expect(days(importCsv(text))).toEqual([['2026-09-14', '37.00', 0]]);
  });

  it('leaves out a position still open at the end, and warns', () => {
    const text = fills(
      fill(1, '2026-09-14T14:00:00Z', 0, 1, 100),
      fill(2, '2026-09-14T14:05:00Z', 1, 1, 110),
      fill(3, '2026-09-15T14:00:00Z', 0, 2, 105),
      fill(4, '2026-09-15T14:05:00Z', 1, 1, 106),
    );
    const result = importCsv(text);
    expect(days(result)).toEqual([['2026-09-14', '20.00', 2]]);
    expect(result.warnings).toEqual([
      'ACC MNQU6: 1 long still open at the end of the file (opened 2026-09-15), so the 2 fills of that position are left out.',
    ]);
  });

  it('never nets two months of the same root', () => {
    const text = fills(
      fill(1, '2026-09-14T14:00:00Z', 0, 1, 100, { contract: 'MNQU6' }),
      fill(2, '2026-09-14T14:01:00Z', 1, 1, 150, { contract: 'MNQZ6' }),
      fill(3, '2026-09-14T14:02:00Z', 1, 1, 110, { contract: 'MNQU6' }),
      fill(4, '2026-09-14T14:03:00Z', 0, 1, 140, { contract: 'MNQZ6' }),
    );
    const result = importCsv(text);
    expect(days(result)).toEqual([['2026-09-14', '40.00', 4]]);
    expect(result.warnings).toEqual([]);
  });

  it('pairs two accounts in one file separately', () => {
    const text = fills(
      fill(1, '2026-09-14T14:00:00Z', 0, 1, 100, { account: 'A' }),
      fill(2, '2026-09-14T14:01:00Z', 1, 1, 90, { account: 'B' }),
      fill(3, '2026-09-14T14:02:00Z', 1, 1, 110, { account: 'A' }),
      fill(4, '2026-09-14T14:03:00Z', 0, 1, 95, { account: 'B' }),
    );
    const result = importCsv(text);
    expect(days(result, 'A')).toEqual([['2026-09-14', '20.00', 2]]);
    expect(days(result, 'B')).toEqual([['2026-09-14', '-10.00', 2]]);
  });

  it('refuses an unknown symbol by name, and accepts a bare root', () => {
    expect(refusal(fills(fill(1, '2026-09-14T14:00:00Z', 0, 1, 100, { contract: 'ZZZU6' })))).toContain('"ZZZU6"');
    const text = fills(fill(1, '2026-09-14T14:00:00Z', 0, 1, 100, { contract: 'MYM' }), fill(2, '2026-09-14T14:05:00Z', 1, 1, 130, { contract: 'MYM' }));
    expect(days(importCsv(text))).toEqual([['2026-09-14', '15.00', 2]]);
  });

  it('counts only the fill sides whose commission is blank', () => {
    const text = fills(fill(1, '2026-09-14T14:00:00Z', 0, 2, 100, { commission: '1.0' }), fill(2, '2026-09-14T14:05:00Z', 1, 2, 110));
    expect(days(importCsv(text))).toEqual([['2026-09-14', '39.00', 2]]);
  });

  it('skips orders that never filled and refuses a file where none did', () => {
    const header = 'Id,AccountName,ContractName,Status,Size,Side,FilledAt,ExecutePrice';
    const text = [
      header,
      '1,TSX,MNQU6,Filled,2,Bid,09/14/2026 09:30:00 -04:00,100',
      '2,TSX,MNQU6,Cancelled,2,Ask,09/14/2026 09:30:00 -04:00,',
      '3,TSX,MNQU6,Rejected,2,Ask,09/14/2026 09:30:00 -04:00,',
      '4,TSX,MNQU6,Filled,2,Ask,09/14/2026 09:40:00 -04:00,101.5',
    ].join('\n');
    const result = importCsv(text);
    expect(days(result, 'TSX')).toEqual([['2026-09-14', '6.00', 4]]);
    expect(result.warnings).toEqual(['Skipped 2 orders that never filled (Cancelled, Rejected).']);
    expect(refusal([header, '2,TSX,MNQU6,Cancelled,2,Ask,,'].join('\n'))).toBe(
      "None of this file's 1 orders filled (Cancelled), so there is nothing to import.",
    );
  });
});

describe('round-trip exports', () => {
  const PERF = 'buyFillId,sellFillId,qty,pnl,boughtTimestamp,soldTimestamp';

  it('dates a short by its later timestamp, the buy, after the 18:00 roll', () => {
    const text = `${PERF}\n11,10,2,$40.00,09/14/2026 18:05:00,09/14/2026 17:50:00`;
    expect(importCsv(text).accounts).toEqual([{ externalId: null, days: [{ date: '2026-09-15', pnl: '40.00', sidesWithoutFees: 4 }], payouts: [] }]);
  });

  it('allows one fill on two rows but refuses the same pair twice', () => {
    const shared = [PERF, '1,2,1,$10.00,09/14/2026 09:30:00,09/14/2026 09:40:00', '1,3,1,$20.00,09/14/2026 09:30:00,09/14/2026 09:50:00'];
    expect(days(importCsv(shared.join('\n')), null)).toEqual([['2026-09-14', '30.00', 4]]);
    expect(refusal([...shared, '1,3,1,$20.00,09/14/2026 09:30:00,09/14/2026 09:50:00'].join('\n'))).toMatch(
      /line 4: buy\/sell fill pair 1\/3 already appeared on line 3/,
    );
  });

  it('refuses a repeated TopstepX trade id', () => {
    expect(refusal('Id,ExitedAt,PnL,Size\n9,09/14/2026 10:00:00 -04:00,5,1\n9,09/14/2026 11:00:00 -04:00,5,1')).toMatch(/Id 9 already appeared/);
  });
});

describe('ledgers', () => {
  const BALANCE = 'Account ID,Account Name,Trade Date,Total Amount';

  it('diffs balances by date whatever the row order, skips the first and leaves out unchanged days', () => {
    const text = [
      BALANCE,
      '1,ACC,2026-09-15,"50,120.00"',
      '1,ACC,2026-09-12,"50,250.00"',
      '1,ACC,2026-09-11,"50,000.00"',
      '1,ACC,2026-09-14,"50,250.00"',
    ].join('\n');
    const result = importCsv(text);
    expect(days(result)).toEqual([
      ['2026-09-12', '250.00', 0],
      ['2026-09-15', '-130.00', 0],
    ]);
    expect(result.warnings).toEqual([
      "ACC: 2026-09-11 is the first balance in the file, so that day's P&L is unknown and it was skipped.",
      'ACC: this file has no Total Realized PNL column, so payouts and fees show up as losing days. Import Cash History too to separate them.',
    ]);
  });

  it('reads trading P&L from Total Realized PNL so a withdrawal is not a losing day', () => {
    const text = [
      'Account ID,Account Name,Trade Date,Total Amount,Total Realized PNL',
      '1,ACC,2026-09-11,"50,300.00",300.00',
      '1,ACC,2026-09-14,"48,900.00",100.00',
      '1,ACC,2026-09-15,"48,900.00",0.00',
    ].join('\n');
    const result = importCsv(text);
    expect(days(result)).toEqual([
      ['2026-09-11', '300.00', 0],
      ['2026-09-14', '100.00', 0],
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('returns an account with one balance row and no days, and says why', () => {
    const result = importCsv(`${BALANCE}\n1,ONE,2026-09-14,"49,490.00"`);
    expect(result.accounts).toEqual([{ externalId: 'ONE', days: [], payouts: [] }]);
    expect(result.warnings).toEqual(['ONE has only one balance row (2026-09-14), so no daily P&L can be worked out for it.']);
  });

  it('refuses the same account and date twice', () => {
    expect(refusal(`${BALANCE}\n1,ACC,2026-09-14,100\n1,ACC,2026-09-14,200`)).toMatch(/the balance for ACC on 2026-09-14 already appeared on line 2/);
  });

  const CASH = 'Account,Transaction ID,Timestamp,Date,Delta,Amount,Cash Change Type,Currency,Contract';

  it('sums Delta, never the running Amount, pays out withdrawals and ignores the rest with a count', () => {
    const text = [
      CASH,
      'ACC,1,09/11/2026 08:00:00,2026-09-11,"50,000.00","50,000.00", Deposit,USD,',
      'ACC,2,09/14/2026 09:30:00,2026-09-14,-0.50,"49,999.50", Commission,USD,MNQU6',
      'ACC,3,09/14/2026 09:40:00,2026-09-14,-0.50,"49,999.00", Commission,USD,MNQU6',
      'ACC,4,09/14/2026 09:40:00,2026-09-14,"1,200.00","51,199.00", Trade Paired,USD,MNQU6',
      'ACC,5,09/14/2026 09:40:00,2026-09-14,-0.25,"51,198.75", Exchange Fee,USD,MNQU6',
      'ACC,6,09/15/2026 09:30:00,2026-09-15,-0.50,"51,198.25", Commission,USD,MNQU6',
      'ACC,7,09/15/2026 09:31:00,2026-09-15,-0.50,"51,197.75", Commission,USD,MNQU6',
      'ACC,8,09/16/2026 10:00:00,2026-09-16,-500.00,"50,697.75", Payout,USD,',
      'ACC,9,09/17/2026 10:00:00,2026-09-17,"-50,697.75",0.00, Reset,USD,',
    ].join('\r\n');
    const result = importCsv(text);
    expect(days(result)).toEqual([
      ['2026-09-14', '1198.75', 0],
      ['2026-09-15', '-1.00', 0],
    ]);
    expect(result.accounts[0]!.payouts).toEqual([{ date: '2026-09-16', amount: '500.00' }]);
    expect(result.warnings).toEqual(['Ignored 2 cash rows that are neither trading nor a payout (Deposit, Reset).']);
  });

  it('refuses a repeated transaction id', () => {
    const row = 'ACC,1,09/14/2026 09:30:00,2026-09-14,-0.50,"49,999.50", Commission,USD,MNQU6';
    expect(refusal([CASH, row, row].join('\n'))).toMatch(/Transaction ID 1 already appeared on line 2/);
  });
});
