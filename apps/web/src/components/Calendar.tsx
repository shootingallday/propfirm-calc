import { useMemo } from 'react';
import { evaluate, netPnl, payoutCalendar, sum, type CalendarEvent } from 'propfirm-calc';

import { amount, shortDate, usd } from '../format.ts';
import type { Store } from '../store.ts';
import { Empty, Fold, Num, PageHead, Stat } from '../ui.tsx';

export function Calendar({ store, onAdd }: { store: Store; onAdd: () => void }) {
  const { accounts, avgDay } = store.saved;
  const calendar = useMemo(() => {
    const overrides = Object.fromEntries(Object.entries(avgDay).flatMap(([id, value]) => {
      const parsed = amount(value, { signed: true });
      return parsed ? [[id, parsed]] : [];
    }));
    return payoutCalendar(accounts, { avgDay: overrides, horizonDays: 60, maxPayouts: Infinity });
  }, [accounts, avgDay]);
  const statuses = useMemo(() => new Map(accounts.map((account) => [account.id, evaluate(account)])), [accounts]);

  const head = (
    <PageHead title="Payout calendar">Best case: every future trading day is your average winning day. Weekends and exchange holidays are skipped.</PageHead>
  );

  if (accounts.length === 0) {
    return (
      <div className="narrow">
        {head}
        <div className="px-card">
          <Empty
            icon="account"
            title="Add accounts to see when they can pay out"
            actions={
              <button type="button" className="px-btn" data-variant="primary" onClick={onAdd}>
                Add an account
              </button>
            }
          />
        </div>
      </div>
    );
  }

  const payouts = calendar.events.filter((event) => event.kind === 'payout');
  const passes = calendar.events.filter((event) => event.kind === 'pass');
  const first = payouts[0];

  return (
    <div className="narrow">
      {head}
      <div className="stats" style={{ marginBlockEnd: 'var(--card-gap)' }}>
        <Stat label="To you in 60 trading days">
          <Num value={sum(payouts.map((event) => event.amount))} fraction={0} />
        </Stat>
        <Stat label="Next payout" sub={first?.label}>
          {first ? shortDate(first.date) : '—'}
        </Stat>
        <Stat label="Evaluations passing">
          <span className="px-num">{passes.length}</span>
        </Stat>
      </div>
      <div className="px-card" data-testid="calendar-weeks">
        {calendar.weeks.length === 0 ? (
          <Empty icon="calendar" title="Nothing lands in the next 60 trading days">
            Not at these averages. Raise an average below, or add more days so one can be measured.
          </Empty>
        ) : (
          calendar.weeks.map((week) => (
            <div className="week" key={week.week}>
              <b>Week of {shortDate(week.week)}</b>
              <div className="stack" style={{ gap: 8 }}>
                {group(week.events).map((line) => (
                  <div className="event" key={line.key}>
                    <time dateTime={line.first}>{shortDate(line.first)}</time>
                    <span>
                      <b>{line.label}</b>
                      <br />
                      <span className="small muted">{line.text}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-num" style={{ textAlign: 'end' }}>
                <b>{week.total.gt(0) ? usd(week.total, 0) : '—'}</b>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="px-accordion" style={{ marginBlockStart: 'var(--card-gap)' }}>
        <Fold title="Averages used">
          <table className="px-table">
            <thead>
              <tr>
                <th>Account</th>
                <th className="r">Measured</th>
                <th className="r">Your average</th>
              </tr>
            </thead>
            <tbody>
              {accounts
                .filter((account) => !statuses.get(account.id)?.blown)
                .map((account) => {
                  const measured = statuses.get(account.id)?.avgWinningDay;
                  const winners = account.days.filter((day) => netPnl(day, account.feePerSide).gt(0)).length;
                  return (
                    <tr key={account.id}>
                      <td>
                        {account.label}{' '}
                        {winners < 5 && (
                          <span className="px-tag" data-tone="warn">
                            {winners} winning {winners === 1 ? 'day' : 'days'}
                          </span>
                        )}
                      </td>
                      <td className="r">
                        <Num value={measured} />
                      </td>
                      <td className="r">
                        <input
                          className="px-input"
                          inputMode="decimal"
                          style={{ inlineSize: 110, display: 'inline-block' }}
                          placeholder={measured ? measured.toFixed(0) : '300'}
                          aria-label={`Your average day for ${account.label}`}
                          value={avgDay[account.id] ?? ''}
                          aria-invalid={!!avgDay[account.id]?.trim() && !amount(avgDay[account.id]!, { signed: true })}
                          onChange={(event) => store.setAvgDay(account.id, event.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <p className="px-hint">Fewer than 5 winning days makes an average rough. Type your own to override it.</p>
        </Fold>
        {calendar.unreachable.length > 0 && (
          <Fold title={`Not on the calendar (${calendar.unreachable.length})`}>
            <dl className="px-dl">
              {calendar.unreachable.map((item) => (
                <div key={item.accountId} style={{ display: 'contents' }}>
                  <dt>{item.label}</dt>
                  <dd>{item.reason}</dd>
                </div>
              ))}
            </dl>
          </Fold>
        )}
      </div>
    </div>
  );
}

function group(events: CalendarEvent[]) {
  const lines = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = `${event.accountId}-${event.kind}-${event.path}`;
    lines.set(key, [...(lines.get(key) ?? []), event]);
  }
  return [...lines].map(([key, list]) => {
    const first = list[0]!;
    const total = sum(list.map((event) => event.amount));
    const text =
      first.kind === 'pass'
        ? 'Passes the evaluation'
        : list.length === 1
          ? `About ${usd(total, 0)} to you via ${first.path}`
          : `${list.length} payouts through ${shortDate(list.at(-1)!.date)}, about ${usd(total, 0)} to you via ${first.path}`;
    return { key, first: first.date, label: first.label, text };
  });
}
