import { ZERO } from '../money.ts';
import { pointValue } from './contracts.ts';
import {
  RowProblem,
  collectRows,
  readEasternWall,
  readInstant,
  readIsoDate,
  readMoney,
  readNumber,
  readOptionalMoney,
  readQuantity,
  readUsDate,
  refuseDuplicates,
  type Row,
  type Table,
} from './csv.ts';
import type { Ledger } from './ledger.ts';
import { pairFills, type Fill } from './pair.ts';
import { cmeTradingDay, easternWallTradingDay } from './trading-day.ts';
import { ImportError, type LayoutId } from './types.ts';

export const COLUMNS = {
  'tradovate-fills': {
    required: { id: '_id', at: '_timestamp', action: '_action', quantity: '_qty', price: '_price', account: 'Account', symbol: 'Contract' },
    optional: { side: 'B/S', commission: 'commission' },
  },
  'topstepx-orders': {
    required: { id: 'Id', account: 'AccountName', symbol: 'ContractName', status: 'Status', quantity: 'Size', side: 'Side', at: 'FilledAt', price: 'ExecutePrice' },
    optional: {},
  },
  'tradovate-performance': {
    required: { buyId: 'buyFillId', sellId: 'sellFillId', quantity: 'qty', pnl: 'pnl', bought: 'boughtTimestamp', sold: 'soldTimestamp' },
    optional: {},
  },
  'tradovate-balance-history': {
    required: { account: 'Account Name', date: 'Trade Date', balance: 'Total Amount' },
    optional: { realized: 'Total Realized PNL' },
  },
  'tradovate-cash-history': {
    required: { account: 'Account', id: 'Transaction ID', date: 'Date', change: 'Delta', type: 'Cash Change Type' },
    optional: {},
  },
  'topstepx-trades': {
    required: { id: 'Id', exitedAt: 'ExitedAt', pnl: 'PnL', quantity: 'Size' },
    optional: { fees: 'Fees', commissions: 'Commissions', tradeDay: 'TradeDay' },
  },
} as const satisfies Record<LayoutId, { required: Record<string, string>; optional: Record<string, string> }>;

export const CASH_CHANGE_TYPES = {
  trading: /^(trade paired|commission|exchange fee|clearing fee|nfa fee|trade fee)$/i,
  payout: /withdraw|payout/i,
};

export const REFUSED = [
  { name: 'Tradovate Orders', marks: ['orderId', 'Fill Time', 'Avg Fill Price'], why: 'lists orders, including ones that never filled' },
  { name: 'Tradovate Position History', marks: ['Position ID', 'Pair ID', 'Buy Fill ID'], why: 'repeats fills across its pairing rows' },
];

type Layout = { id: LayoutId; label: string; read: (table: Table, ledger: Ledger) => string[] };

const tradovateFills: Layout = {
  id: 'tradovate-fills',
  label: 'Tradovate Fills',
  read(table, ledger) {
    const c = { ...COLUMNS['tradovate-fills'].required, ...COLUMNS['tradovate-fills'].optional };
    const fills = collectRows(this.label, table.rows, (row): Fill => {
      const id = row.field(c.id);
      if (!/^\d+$/.test(id)) throw new RowProblem(`${c.id} must be a whole number, not "${id}"`);
      return {
        line: row.line,
        id,
        account: readAccount(row, c.account),
        symbol: readSymbol(row, c.symbol),
        side: readTradovateSide(row.field(c.action), row.field(c.side)),
        quantity: readQuantity(row, c.quantity),
        price: readNumber(row, c.price),
        at: readInstant(row, c.at),
        fee: readOptionalMoney(row, c.commission),
      };
    });
    refuseDuplicates(this.label, fills, (fill) => fill.id, (fill) => fill.line, c.id);
    return pairFills(fills, ledger);
  },
};

const topstepxOrders: Layout = {
  id: 'topstepx-orders',
  label: 'TopstepX Orders',
  read(table, ledger) {
    const c = COLUMNS['topstepx-orders'].required;
    const statuses = new Map<string, number>();
    const orders = collectRows(this.label, table.rows, (row): Fill | null => {
      const status = row.field(c.status);
      if (status.toLowerCase() !== 'filled') {
        statuses.set(status || 'blank', (statuses.get(status || 'blank') ?? 0) + 1);
        return null;
      }
      const id = row.field(c.id);
      if (id === '') throw new RowProblem(`${c.id} is blank`);
      const side = row.field(c.side).toLowerCase();
      if (!['bid', 'ask', 'buy', 'sell'].includes(side)) throw new RowProblem(`${c.side} must be Bid or Ask, not "${row.field(c.side)}"`);
      return {
        line: row.line,
        id,
        account: readAccount(row, c.account),
        symbol: readSymbol(row, c.symbol),
        side: side === 'bid' || side === 'buy' ? 'buy' : 'sell',
        quantity: readQuantity(row, c.quantity),
        price: readNumber(row, c.price),
        at: readInstant(row, c.at),
        fee: null,
      };
    });
    const skipped = [...statuses.values()].reduce((total, count) => total + count, 0);
    const named = [...statuses.keys()].join(', ');
    const fills = orders.filter((order): order is Fill => order !== null);
    if (fills.length === 0) {
      throw new ImportError(`None of this file's ${skipped} orders filled (${named}), so there is nothing to import.`);
    }
    refuseDuplicates(this.label, fills, (fill) => fill.id, (fill) => fill.line, c.id);
    const warnings = pairFills(fills, ledger);
    return skipped > 0 ? [`Skipped ${skipped} ${skipped === 1 ? 'order' : 'orders'} that never filled (${named}).`, ...warnings] : warnings;
  },
};

const tradovatePerformance: Layout = {
  id: 'tradovate-performance',
  label: 'Tradovate Performance',
  read(table, ledger) {
    const c = COLUMNS['tradovate-performance'].required;
    const trips = collectRows(this.label, table.rows, (row) => {
      const [buyId, sellId] = [row.field(c.buyId), row.field(c.sellId)];
      if (buyId === '' || sellId === '') throw new RowProblem(`${c.buyId} and ${c.sellId} must both be filled in`);
      const bought = readEasternWall(row, c.bought);
      const sold = readEasternWall(row, c.sold);
      const last = bought.sortKey > sold.sortKey ? bought : sold;
      return {
        line: row.line,
        pair: `${buyId}/${sellId}`,
        pnl: readMoney(row, c.pnl),
        quantity: readQuantity(row, c.quantity),
        date: easternWallTradingDay(last.date, last.hour),
      };
    });
    refuseDuplicates(this.label, trips, (trip) => trip.pair, (trip) => trip.line, 'buy/sell fill pair');
    for (const trip of trips) ledger.add(null, trip.date, trip.pnl, trip.quantity.times(2).toNumber());
    return [];
  },
};

const tradovateBalanceHistory: Layout = {
  id: 'tradovate-balance-history',
  label: 'Tradovate Account Balance History',
  read(table, ledger) {
    const c = { ...COLUMNS['tradovate-balance-history'].required, ...COLUMNS['tradovate-balance-history'].optional };
    const hasRealized = table.header.includes(c.realized);
    const rows = collectRows(this.label, table.rows, (row) => ({
      line: row.line,
      account: readAccount(row, c.account),
      date: readIsoDate(row, c.date),
      balance: readMoney(row, c.balance),
      realized: hasRealized ? readOptionalMoney(row, c.realized) : null,
    }));
    refuseDuplicates(this.label, rows, (row) => `${row.account} on ${row.date}`, (row) => row.line, 'the balance for');
    const warnings: string[] = [];
    for (const account of [...new Set(rows.map((row) => row.account))].sort()) {
      ledger.open(account);
      const history = rows.filter((row) => row.account === account).sort((a, b) => a.date.localeCompare(b.date));
      if (hasRealized) {
        for (const row of history) if (row.realized && !row.realized.isZero()) ledger.add(account, row.date, row.realized, 0);
        continue;
      }
      const first = history[0]!;
      if (history.length === 1) {
        warnings.push(`${account} has only one balance row (${first.date}), so no daily P&L can be worked out for it.`);
        continue;
      }
      warnings.push(`${account}: ${first.date} is the first balance in the file, so that day's P&L is unknown and it was skipped.`);
      warnings.push(`${account}: this file has no Total Realized PNL column, so payouts and fees show up as losing days. Import Cash History too to separate them.`);
      history.slice(1).forEach((row, index) => {
        const change = row.balance.minus(history[index]!.balance);
        if (!change.isZero()) ledger.add(account, row.date, change, 0);
      });
    }
    return warnings;
  },
};

const tradovateCashHistory: Layout = {
  id: 'tradovate-cash-history',
  label: 'Tradovate Cash History',
  read(table, ledger) {
    const c = COLUMNS['tradovate-cash-history'].required;
    const rows = collectRows(this.label, table.rows, (row) => {
      const id = row.field(c.id);
      if (id === '') throw new RowProblem(`${c.id} is blank`);
      return {
        line: row.line,
        id,
        account: readAccount(row, c.account),
        date: readIsoDate(row, c.date),
        change: readMoney(row, c.change),
        type: row.field(c.type),
      };
    });
    refuseDuplicates(this.label, rows, (row) => row.id, (row) => row.line, c.id);
    const ignored = new Map<string, number>();
    for (const row of rows) {
      ledger.open(row.account);
      if (CASH_CHANGE_TYPES.trading.test(row.type)) ledger.add(row.account, row.date, row.change, 0);
      else if (CASH_CHANGE_TYPES.payout.test(row.type)) ledger.payout(row.account, row.date, row.change.abs());
      else ignored.set(row.type || 'blank', (ignored.get(row.type || 'blank') ?? 0) + 1);
    }
    const count = [...ignored.values()].reduce((total, value) => total + value, 0);
    return count === 0
      ? []
      : [`Ignored ${count} cash ${count === 1 ? 'row' : 'rows'} that ${count === 1 ? 'is' : 'are'} neither trading nor a payout (${[...ignored.keys()].join(', ')}).`];
  },
};

const topstepxTrades: Layout = {
  id: 'topstepx-trades',
  label: 'TopstepX Trades',
  read(table, ledger) {
    const c = { ...COLUMNS['topstepx-trades'].required, ...COLUMNS['topstepx-trades'].optional };
    const trips = collectRows(this.label, table.rows, (row) => {
      const id = row.field(c.id);
      if (id === '') throw new RowProblem(`${c.id} is blank`);
      const fees = readOptionalMoney(row, c.fees);
      const commissions = readOptionalMoney(row, c.commissions);
      const quantity = readQuantity(row, c.quantity);
      return {
        line: row.line,
        id,
        pnl: readMoney(row, c.pnl).minus(fees ?? ZERO).minus(commissions ?? ZERO),
        sides: fees === null && commissions === null ? quantity.times(2).toNumber() : 0,
        date: row.field(c.tradeDay) === '' ? cmeTradingDay(readInstant(row, c.exitedAt)) : readUsDate(row, c.tradeDay),
      };
    });
    refuseDuplicates(this.label, trips, (trip) => trip.id, (trip) => trip.line, c.id);
    for (const trip of trips) ledger.add(null, trip.date, trip.pnl, trip.sides);
    return [];
  },
};

export const LAYOUTS: readonly Layout[] = [
  tradovateFills,
  topstepxOrders,
  tradovatePerformance,
  tradovateBalanceHistory,
  tradovateCashHistory,
  topstepxTrades,
];

export function requiredColumns(id: LayoutId): string[] {
  return Object.values(COLUMNS[id].required);
}

function readAccount(row: Row, name: string): string {
  const account = row.field(name);
  if (account === '') throw new RowProblem(`${name} is blank, so the row names no account`);
  return account;
}

function readSymbol(row: Row, name: string): string {
  const symbol = row.field(name);
  if (symbol === '') throw new RowProblem(`${name} is blank`);
  pointValue(symbol);
  return symbol.toUpperCase();
}

function readTradovateSide(action: string, display: string): 'buy' | 'sell' {
  if (action === '0') return 'buy';
  if (action === '1') return 'sell';
  const text = display.toLowerCase();
  if (text === 'buy' || text === 'sell') return text;
  throw new RowProblem(`_action must be 0 (buy) or 1 (sell), not "${action}"`);
}
