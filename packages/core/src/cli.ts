#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs, type ParseArgsConfig } from 'node:util';

import type { Account } from './account.ts';
import { FIRMS } from './catalog/index.ts';
import { consistencyOk, bestDayPct, requiredProfit } from './consistency.ts';
import { cushion, drawdownFloor, isBlown, DRAWDOWN_TYPES, type DrawdownType } from './drawdown.ts';
import { evaluate } from './evaluate.ts';
import { importCsv } from './imports/index.ts';
import { Decimal, formatMoney, money } from './money.ts';
import { payoutProjection } from './projection.ts';
import { maxContracts, maxContractsFromCushion, positionRisk } from './sizing.ts';
import { payoutEligibility } from './target.ts';

type Row = [string, string];
type Output = { title: string; rows: Row[]; payload: unknown };
type Options = ParseArgsConfig['options'];

const ACCOUNT: Options = {
  balance: { type: 'string' },
  'max-dd': { type: 'string' },
  peak: { type: 'string' },
  type: { type: 'string', default: 'trailing' },
  'lock-at': { type: 'string' },
};

const CONSTRAINTS: Options = {
  target: { type: 'string' },
  'winning-days': { type: 'string' },
  'min-winning-days': { type: 'string' },
  'best-day': { type: 'string' },
  pct: { type: 'string' },
};

type Values = Record<string, string | boolean | undefined>;

function need(values: Values, name: string): string {
  const value = values[name];
  if (typeof value !== 'string') throw new RangeError(`--${name} is required`);
  if (!Number.isFinite(Number(value))) throw new RangeError(`--${name} must be a number, got "${value}"`);
  return value;
}

function maybe(values: Values, name: string): string | undefined {
  return values[name] === undefined ? undefined : need(values, name);
}

function maybeInt(values: Values, name: string): number | undefined {
  const value = maybe(values, name);
  return value === undefined ? undefined : Number.parseInt(value, 10);
}

function ddType(values: Values): DrawdownType {
  const value = String(values.type);
  if (!DRAWDOWN_TYPES.includes(value as DrawdownType)) throw new RangeError(`--type must be one of ${DRAWDOWN_TYPES.join(', ')}`);
  return value as DrawdownType;
}

const days = (value: number) => (Number.isFinite(value) ? `${value} trading days` : 'never at this average');
const pct = (value: Decimal) => (value.isFinite() ? `${value.toFixed(1)}%` : '∞');

const COMMANDS: Record<string, { summary: string; options: Options; run: (values: Values, positionals: string[]) => Output }> = {
  drawdown: {
    summary: 'Drawdown floor, cushion and breach status',
    options: { ...ACCOUNT, equity: { type: 'string' } },
    run(values) {
      const args = [need(values, 'balance'), need(values, 'max-dd'), need(values, 'peak'), ddType(values), maybe(values, 'lock-at')] as const;
      const floor = drawdownFloor(...args);
      const rows: Row[] = [['Floor', formatMoney(floor)]];
      const payload: Record<string, unknown> = { floor };
      const equity = maybe(values, 'equity');
      if (equity !== undefined) {
        const room = cushion(equity, ...args);
        const blown = isBlown(equity, ...args);
        rows.push(['Cushion', formatMoney(room)], ['Status', blown ? 'BLOWN' : 'ok']);
        Object.assign(payload, { cushion: room, blown });
      }
      return { title: 'Drawdown', rows, payload };
    },
  },
  consistency: {
    summary: 'Best-day percentage against the consistency cap',
    options: { 'best-day': { type: 'string' }, total: { type: 'string' }, pct: { type: 'string' } },
    run(values) {
      const [best, total, cap] = [need(values, 'best-day'), need(values, 'total'), need(values, 'pct')];
      const share = bestDayPct(best, total);
      const ok = consistencyOk(best, total, cap);
      const needed = requiredProfit(best, cap);
      return {
        title: 'Consistency rule',
        rows: [['Best day share', pct(share)], ['Status', ok ? 'ok' : 'over the cap'], ['Total needed', formatMoney(needed)]],
        payload: { best_day_pct: share, ok, required_profit: needed },
      };
    },
  },
  payout: {
    summary: 'Whether a payout is available right now, and what blocks it',
    options: { profit: { type: 'string' }, ...CONSTRAINTS },
    run(values) {
      const result = payoutEligibility(need(values, 'profit'), {
        profitTarget: maybe(values, 'target'),
        winningDays: maybeInt(values, 'winning-days'),
        minWinningDays: maybeInt(values, 'min-winning-days'),
        bestDayProfit: maybe(values, 'best-day'),
        consistencyPct: maybe(values, 'pct'),
      });
      const rows: Row[] = [['Eligible', result.eligible ? 'yes' : 'no'], ...result.blockers.map((b): Row => ['Blocked by', b])];
      if (result.consistencyRequiredProfit) rows.push(['Consistency needs total', formatMoney(result.consistencyRequiredProfit)]);
      return { title: 'Payout eligibility', rows, payload: result };
    },
  },
  size: {
    summary: 'Largest position that cannot breach the account',
    options: {
      'tick-value': { type: 'string' },
      'stop-ticks': { type: 'string' },
      risk: { type: 'string' },
      equity: { type: 'string' },
      'risk-pct': { type: 'string', default: '100' },
      ...ACCOUNT,
    },
    run(values) {
      const tickValue = need(values, 'tick-value');
      const stopTicks = need(values, 'stop-ticks');
      const risk = maybe(values, 'risk');
      let contracts: number;
      let basis: string;
      if (risk !== undefined) {
        contracts = maxContracts(risk, stopTicks, tickValue);
        basis = 'risk budget';
      } else {
        if (['equity', 'balance', 'max-dd', 'peak'].some((name) => values[name] === undefined)) {
          throw new RangeError('pass --risk, or all of --equity --balance --max-dd --peak to size against the drawdown floor');
        }
        contracts = maxContractsFromCushion({
          currentEquity: need(values, 'equity'),
          startingBalance: need(values, 'balance'),
          maxDrawdown: need(values, 'max-dd'),
          peakEquity: need(values, 'peak'),
          stopTicks,
          tickValue,
          riskPct: Number(need(values, 'risk-pct')),
          ddType: ddType(values),
          lockAt: maybe(values, 'lock-at'),
        });
        basis = 'drawdown cushion';
      }
      const atRisk = positionRisk(stopTicks, tickValue, contracts);
      return {
        title: 'Position size',
        rows: [['Max contracts', String(contracts)], ['Sized against', basis], ['Loss at stop', formatMoney(atRisk)]],
        payload: { contracts, basis, risk_at_stop: atRisk },
      };
    },
  },
  project: {
    summary: 'Trading days until a payout is available',
    options: { profit: { type: 'string' }, 'avg-daily': { type: 'string' }, ...CONSTRAINTS },
    run(values) {
      const result = payoutProjection(need(values, 'profit'), need(values, 'avg-daily'), {
        profitTarget: maybe(values, 'target'),
        winningDays: maybeInt(values, 'winning-days'),
        minWinningDays: maybeInt(values, 'min-winning-days'),
        bestDayProfit: maybe(values, 'best-day'),
        consistencyPct: maybe(values, 'pct'),
      });
      return {
        title: 'Payout projection',
        rows: [
          ['Payout in', days(result.tradingDays)],
          ['Held up by', result.bindingConstraint ?? 'nothing'],
          ['Profit by then', result.projectedProfit.isFinite() ? formatMoney(result.projectedProfit) : '—'],
        ],
        payload: result,
      };
    },
  },
  firms: {
    summary: 'List the firms, plans and stages in the rules catalog',
    options: {},
    run() {
      const rows: Row[] = FIRMS.flatMap((firm) =>
        firm.plans.map((plan): Row => [plan.id, plan.stages.map((stage) => `${stage.stage}: ${stage.name}`).join(' → ')]),
      );
      return { title: 'Rules catalog', rows, payload: FIRMS };
    },
  },
  import: {
    summary: 'Read a Tradovate or TopstepX CSV export and show daily P&L per account',
    options: {},
    run(_values, positionals) {
      const path = positionals[0];
      if (!path) throw new RangeError('usage: propfirm-calc import <file.csv>');
      const result = importCsv(readFileSync(path, 'utf8'));
      const rows: Row[] = [['Export', result.label]];
      for (const account of result.accounts) {
        rows.push(['Account', account.externalId ?? '(file names no account)']);
        for (const day of account.days) rows.push([`  ${day.date}`, formatMoney(money(day.pnl)) + (day.sidesWithoutFees ? ` (+fees on ${day.sidesWithoutFees} sides)` : '')]);
        for (const payout of account.payouts) rows.push([`  payout ${payout.date}`, formatMoney(money(payout.amount))]);
      }
      for (const warning of result.warnings) rows.push(['Warning', warning]);
      return { title: 'Import', rows, payload: result };
    },
  },
  status: {
    summary: 'Evaluate accounts exported from the web app (accounts.json)',
    options: { 'what-if': { type: 'string' } },
    run(values, positionals) {
      const path = positionals[0];
      if (!path) throw new RangeError('usage: propfirm-calc status <accounts.json> [--what-if 500]');
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { accounts?: Account[] } | Account[];
      const accounts = Array.isArray(parsed) ? parsed : (parsed.accounts ?? []);
      const whatIf = maybe(values, 'what-if');
      const statuses = accounts.map((account) => ({ account, status: evaluate(account, whatIf === undefined ? {} : { whatIf }) }));
      const rows: Row[] = statuses.flatMap(({ account, status }): Row[] => {
        const next = status.payout
          ? status.payout.best.eligible
            ? `payout ready via ${status.payout.best.name}: ${formatMoney(status.payout.best.estimatedPayout)}`
            : `payout in ${days(status.payout.best.daysToEligible)} via ${status.payout.best.name}`
          : status.evaluation
            ? status.evaluation.passed
              ? 'passed'
              : `pass in ${days(status.evaluation.daysToPass)}`
            : '';
        return [
          [account.label, status.blown ? `BLOWN ${status.blown.date} (${status.blown.reason})` : `balance ${formatMoney(status.balance)}, cushion ${formatMoney(status.cushion)}`],
          ['', next],
        ];
      });
      return { title: whatIf === undefined ? 'Accounts' : `Accounts if the next day is ${formatMoney(money(whatIf))}`, rows, payload: statuses.map((s) => s.status) };
    },
  },
};

function jsonable(value: unknown): unknown {
  if (value instanceof Decimal) return value.isFinite() ? value.toNumber() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(jsonable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonable(v)]));
  return value;
}

function render(output: Output): string {
  const width = Math.max(...output.rows.map(([label]) => label.length), 0);
  return [output.title, ...output.rows.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`)].join('\n');
}

function help(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  return [
    'usage: propfirm-calc <command> [options] [--json]',
    '',
    ...Object.entries(COMMANDS).map(([name, command]) => `  ${name.padEnd(width)}  ${command.summary}`),
  ].join('\n');
}

export function main(argv: string[]): number {
  const [name, ...rest] = argv;
  if (!name || name === '--help' || name === '-h') {
    console.log(help());
    return name ? 0 : 2;
  }
  const command = COMMANDS[name];
  if (!command) {
    console.error(`error: unknown command "${name}"\n\n${help()}`);
    return 2;
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    const flags = Object.keys(command.options ?? {}).map((flag) => `--${flag}`);
    console.log([`propfirm-calc ${name}: ${command.summary}`, flags.length ? `options: ${flags.join(' ')} --json` : 'options: --json'].join('\n'));
    return 0;
  }
  try {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { ...command.options, json: { type: 'boolean', default: false } },
      allowPositionals: true,
    });
    const output = command.run(values as Values, positionals);
    console.log(values.json ? JSON.stringify(jsonable(output.payload), null, 2) : render(output));
    return 0;
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
