import { useMemo, useState } from 'react';
import { evaluate, maxContracts, payoutProjection } from 'propfirm-calc';

import { usd } from '../format.ts';
import type { Store } from '../store.ts';
import { PageHead, Stat } from '../ui.tsx';

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="px-field">
      <span className="px-label">{label}</span>
      <input className="px-input" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

const valid = (...values: string[]) => values.every((value) => value !== '' && Number.isFinite(Number(value)));

export function Tools({ store }: { store: Store }) {
  const live = useMemo(
    () => store.saved.accounts.map((account) => ({ account, status: evaluate(account) })).filter(({ status }) => !status.blown),
    [store.saved.accounts],
  );
  const [pick, setPick] = useState(live[0]?.account.id ?? '');
  const [tick, setTick] = useState('5');
  const [stop, setStop] = useState('20');
  const [risk, setRisk] = useState('500');
  const [profit, setProfit] = useState('1800');
  const [target, setTarget] = useState('3000');
  const [avg, setAvg] = useState('400');
  const [best, setBest] = useState('900');
  const [pct, setPct] = useState('50');

  const chosen = live.find(({ account }) => account.id === pick);
  const contracts = valid(tick, stop, risk) && Number(tick) > 0 && Number(stop) > 0 ? maxContracts(risk, stop, tick) : null;
  const projection = valid(profit, target, avg) ? payoutProjection(profit, avg, { profitTarget: target, ...(valid(best, pct) && Number(pct) > 0 ? { bestDayProfit: best, consistencyPct: pct } : {}) }) : null;

  return (
    <div className="narrow">
      <PageHead title="Tools">
        The same engine as the <code>size</code> and <code>project</code> commands in the CLI.
      </PageHead>
      <div className="grid2">
        <section className="px-card stack" style={{ padding: 'var(--px-space-4) var(--cell-px)' }} aria-labelledby="ps-h">
          <h2 id="ps-h" style={{ fontSize: 'var(--px-text-md)' }}>
            Position size
          </h2>
          {live.length > 0 && (
            <label className="px-field">
              <span className="px-label">Account</span>
              <select
                className="px-input"
                value={pick}
                onChange={(event) => {
                  setPick(event.target.value);
                  const room = live.find(({ account }) => account.id === event.target.value)?.status.cushion;
                  if (room) setRisk(room.toFixed(0));
                }}
              >
                {live.map(({ account, status }) => (
                  <option key={account.id} value={account.id}>
                    {account.label} · {usd(status.cushion, 0)} room
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="fields">
            <Field label="Tick value" value={tick} onChange={setTick} />
            <Field label="Stop in ticks" value={stop} onChange={setStop} />
          </div>
          <Field label="Risk per trade" value={risk} onChange={setRisk} />
          <Stat label="Contracts" sub={chosen && Number(risk) > chosen.status.cushion.toNumber() ? 'More than the room left on this account' : undefined}>
            <span className="px-num" data-testid="contracts">
              {contracts === null ? '—' : `${contracts} ${contracts === 1 ? 'contract' : 'contracts'}`}
            </span>
          </Stat>
        </section>
        <section className="px-card stack" style={{ padding: 'var(--px-space-4) var(--cell-px)' }} aria-labelledby="dt-h">
          <h2 id="dt-h" style={{ fontSize: 'var(--px-text-md)' }}>
            Days to target
          </h2>
          <div className="fields">
            <Field label="Profit so far" value={profit} onChange={setProfit} />
            <Field label="Target" value={target} onChange={setTarget} />
            <Field label="Average day" value={avg} onChange={setAvg} />
            <Field label="Best day" value={best} onChange={setBest} />
            <Field label="Consistency %" value={pct} onChange={setPct} />
          </div>
          <Stat label="Trading days to the target" sub={projection?.bindingConstraint === 'consistency' ? 'Consistency raises the target' : undefined}>
            <span className="px-num" data-testid="days-to-target">
              {projection === null ? '—' : Number.isFinite(projection.tradingDays) ? `${projection.tradingDays} ${projection.tradingDays === 1 ? 'day' : 'days'}` : 'Not at this average'}
            </span>
          </Stat>
        </section>
      </div>
    </div>
  );
}
