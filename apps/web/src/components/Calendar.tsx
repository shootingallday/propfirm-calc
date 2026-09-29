import { useMemo } from 'react';
import { evaluate, netPnl, payoutCalendar } from 'propfirm-calc';

import { usd } from '../format.ts';
import type { Store } from '../store.ts';

export function Calendar({ store }: { store: Store }) {
  const { accounts } = store.saved;
  const avgDay = store.saved.avgDay;
  const calendar = useMemo(() => {
    const overrides = Object.fromEntries(Object.entries(avgDay).filter(([, value]) => value !== '' && !Number.isNaN(Number(value))));
    return payoutCalendar(accounts, { avgDay: overrides, horizonDays: 60 });
  }, [accounts, avgDay]);

  if (accounts.length === 0) return <p className="empty">Add accounts to see when they can pay out.</p>;

  return (
    <section className="calendar">
      <div className="panel">
        <h2>Payout calendar</h2>
        <p className="muted">
          Each account assumes every future trading day is the same winning day below. That's the best case, not a forecast. Weekends and full exchange closures (New Year, Good Friday, Christmas) are skipped.
        </p>
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th className="num">Avg winning day</th>
              <th className="num">Assume every day is</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const measured = evaluate(account).avgWinningDay;
              const winners = account.days.filter((day) => netPnl(day, account.feePerSide).gt(0)).length;
              return (
                <tr key={account.id}>
                  <td>{account.label}</td>
                  <td className="num mono">
                    {usd(measured)}
                    <span className={`small ${winners < 5 ? 'warn-text' : 'muted'}`}> from {winners} winning {winners === 1 ? 'day' : 'days'}{winners < 5 ? ', too few to lean on' : ''}</span>
                  </td>
                  <td className="num">
                    <input
                      className="narrow"
                      inputMode="decimal"
                      aria-label={`Average day for ${account.label}`}
                      placeholder={measured ? measured.toFixed(0) : 'e.g. 300'}
                      value={avgDay[account.id] ?? ''}
                      onChange={(event) => store.setAvgDay(account.id, event.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {calendar.weeks.length === 0 ? (
        <p className="panel muted">Nothing lands in the next 60 trading days at these averages.</p>
      ) : (
        <ol className="weeks" data-testid="calendar-weeks">
          {calendar.weeks.map((week) => (
            <li key={week.week} className="panel">
              <header className="week-head">
                <h3>Week of {week.week}</h3>
                <strong className="mono gain">{usd(week.total)}</strong>
              </header>
              <ul className="plain">
                {week.events.map((event) => (
                  <li key={`${event.accountId}-${event.date}-${event.kind}`}>
                    <span className="mono">{event.date}</span> {event.label}:{' '}
                    {event.kind === 'pass' ? 'passes the evaluation' : `about ${usd(event.amount)} to you via ${event.path}`}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {calendar.unreachable.length > 0 && (
        <div className="panel">
          <h3>Not on the calendar</h3>
          <ul className="plain">
            {calendar.unreachable.map((item) => (
              <li key={item.accountId}>
                {item.label}: {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
