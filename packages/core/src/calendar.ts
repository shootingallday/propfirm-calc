import { addPayout, type Account, type DayEntry } from './account.ts';
import { addTradingDays, todayIso, weekStart } from './dates.ts';
import { evaluate } from './evaluate.ts';
import { money, sum, type Money, type MoneyInput } from './money.ts';

export type CalendarEvent = {
  accountId: string;
  label: string;
  date: string;
  kind: 'payout' | 'pass';
  path: string | null;
  amount: Money;
};

export type CalendarWeek = { week: string; total: Money; events: CalendarEvent[] };

export type Unreachable = { accountId: string; label: string; reason: string };

export type PayoutCalendar = {
  events: CalendarEvent[];
  weeks: CalendarWeek[];
  unreachable: Unreachable[];
  horizonEnd: string;
};

export type CalendarOptions = {
  today?: string;
  horizonDays?: number;
  maxPayouts?: number;
  avgDay?: Record<string, MoneyInput | undefined>;
};

function simulate(
  input: Account,
  avg: Money,
  today: string,
  horizonEnd: string,
  maxPayouts: number,
): { events: CalendarEvent[]; stopped: string | null } {
  let account = input;
  const events: CalendarEvent[] = [];
  const last = account.days.at(-1)?.date;
  let cursor = last !== undefined && last > today ? last : today;
  for (let guard = 0; guard < 200 && cursor <= horizonEnd; guard += 1) {
    const status = evaluate(account, { avgDay: avg, today });
    if (status.blown) return { events, stopped: `Blown on ${status.blown.date}` };
    if (!status.payout) {
      if (!status.evaluation) return { events, stopped: 'No payout rules for this stage' };
      if (status.evaluation.passed) {
        events.push({ accountId: account.id, label: account.label, date: cursor, kind: 'pass', path: null, amount: money(0) });
        return { events, stopped: null };
      }
      const step = status.evaluation.daysToPass;
      if (!Number.isFinite(step)) return { events, stopped: status.evaluation.blockers[0] ?? 'Cannot pass at this average' };
      ({ account, cursor } = extend(account, cursor, Math.max(1, step), avg, horizonEnd));
      continue;
    }
    const best = status.payout.best;
    if (best.eligible) {
      if (best.withdrawable.lte(0)) return { events, stopped: 'Nothing left to withdraw' };
      events.push({
        accountId: account.id,
        label: account.label,
        date: cursor,
        kind: 'payout',
        path: best.name,
        amount: best.estimatedPayout,
      });
      if (events.length >= maxPayouts) return { events, stopped: null };
      account = addPayout(account, cursor, best.withdrawable);
      ({ account, cursor } = extend(account, cursor, 1, avg, horizonEnd));
      continue;
    }
    if (!Number.isFinite(best.daysToEligible)) return { events, stopped: best.blockers[0] ?? 'Cannot reach a payout at this average' };
    ({ account, cursor } = extend(account, cursor, Math.max(1, best.daysToEligible), avg, horizonEnd));
  }
  return { events, stopped: null };
}

function extend(account: Account, cursor: string, count: number, avg: Money, horizonEnd: string): { account: Account; cursor: string } {
  const added: DayEntry[] = [];
  let date = cursor;
  for (let i = 0; i < count && date <= horizonEnd; i += 1) {
    date = addTradingDays(date, 1);
    added.push({ date, pnl: avg.toString(), source: 'projection' });
  }
  return { account: { ...account, days: [...account.days, ...added] }, cursor: date };
}

export function payoutCalendar(accounts: readonly Account[], options: CalendarOptions = {}): PayoutCalendar {
  const today = options.today ?? todayIso();
  const horizonEnd = addTradingDays(today, options.horizonDays ?? 60);
  const events: CalendarEvent[] = [];
  const unreachable: Unreachable[] = [];
  for (const account of accounts) {
    const override = options.avgDay?.[account.id];
    const avg = override !== undefined ? money(override) : evaluate(account, { today }).avgWinningDay;
    if (avg === null || avg.lte(0)) {
      unreachable.push({ accountId: account.id, label: account.label, reason: 'Needs an average day above $0' });
      continue;
    }
    const result = simulate(account, avg, today, horizonEnd, options.maxPayouts ?? 6);
    events.push(...result.events);
    if (result.events.length === 0) {
      unreachable.push({ accountId: account.id, label: account.label, reason: result.stopped ?? 'Nothing within the horizon' });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  const byWeek = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const week = weekStart(event.date);
    byWeek.set(week, [...(byWeek.get(week) ?? []), event]);
  }
  const weeks = [...byWeek.entries()].map(([week, list]) => ({
    week,
    total: sum(list.map((event) => event.amount)),
    events: list,
  }));
  return { events, weeks, unreachable, horizonEnd };
}
