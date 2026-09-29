import { useState } from 'react';
import {
  addPayout,
  CATALOG_VERSION,
  createAccount,
  evaluate,
  FIRMS,
  money,
  netPnl,
  removeDay,
  removePayout,
  setDay,
  type Account,
  type Stage,
  type StageRules,
} from 'propfirm-calc';

import { signed, tone, usd } from '../format.ts';
import { newId, parseSaved, type Store } from '../store.ts';

function AddAccount({ store, onDone }: { store: Store; onDone: (id: string) => void }) {
  const [firmId, setFirmId] = useState(FIRMS[0]?.id ?? '');
  const firm = FIRMS.find((item) => item.id === firmId);
  const [planId, setPlanId] = useState(firm?.plans[0]?.id ?? '');
  const plan = firm?.plans.find((item) => item.id === planId) ?? firm?.plans[0];
  const [stage, setStage] = useState<Stage>(plan?.stages[0]?.stage ?? 'eval');
  const [label, setLabel] = useState('');
  const [fee, setFee] = useState('0');
  const rules = plan?.stages.find((item) => item.stage === stage) ?? plan?.stages[0];

  function add() {
    if (!firm || !plan || !rules) return;
    const account = createAccount({
      id: newId(),
      label: label.trim() || `${firm.name} ${plan.program} ${plan.size / 1000}K`,
      firm,
      plan,
      stage: rules.stage,
      catalogVersion: CATALOG_VERSION,
      feePerSide: fee || '0',
    });
    store.addAccounts([account]);
    setLabel('');
    onDone(account.id);
  }

  return (
    <form
      className="panel add"
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <h2>Add an account</h2>
      <div className="fields">
        <label>
          Firm
          <select
            value={firmId}
            onChange={(event) => {
              const next = FIRMS.find((item) => item.id === event.target.value);
              setFirmId(event.target.value);
              setPlanId(next?.plans[0]?.id ?? '');
              setStage(next?.plans[0]?.stages[0]?.stage ?? 'eval');
            }}
          >
            {FIRMS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plan
          <select
            value={plan?.id ?? ''}
            onChange={(event) => {
              setPlanId(event.target.value);
              const next = firm?.plans.find((item) => item.id === event.target.value);
              setStage(next?.stages[0]?.stage ?? 'eval');
            }}
          >
            {firm?.plans.map((item) => (
              <option key={item.id} value={item.id}>
                {item.program} · {usd(money(item.size))}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stage
          <select value={rules?.stage ?? stage} onChange={(event) => setStage(event.target.value as Stage)}>
            {plan?.stages.map((item) => (
              <option key={item.stage} value={item.stage}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input value={label} placeholder="e.g. Topstep 50K #2" onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Fee per contract per side
          <input inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} />
        </label>
      </div>
      {rules && <RulesSummary rules={rules} />}
      <button type="submit" className="primary">
        Add account
      </button>
    </form>
  );
}

function RulesSummary({ rules }: { rules: StageRules }) {
  const dd = rules.drawdown;
  const lock = dd.lockAt === 'start' ? 'locks at the starting balance' : dd.lockAt === 'never' ? 'never locks' : `locks at start + ${usd(money(dd.lockAt.aboveStart))}`;
  return (
    <div className="rules">
      <ul>
        <li>
          Drawdown {usd(money(dd.amount))}, {dd.mode.replace('_', ' ')}
          {dd.mode === 'static' ? '' : `, ${lock}`}
        </li>
        {rules.profitTarget && <li>Profit target {usd(money(rules.profitTarget))}</li>}
        {rules.minTradingDays !== undefined && <li>At least {rules.minTradingDays} trading days</li>}
        {rules.dailyLoss && (
          <li>
            Daily loss {usd(money(rules.dailyLoss.amount))} ({rules.dailyLoss.effect === 'breach' ? 'fails the account' : 'stops trading for the day'})
          </li>
        )}
        {rules.consistency && (
          <li>
            Consistency {rules.consistency.pct}% of {rules.consistency.basis.replaceAll('_', ' ')}
          </li>
        )}
        {rules.payoutPaths?.map((path) => (
          <li key={path.name}>
            Payout path “{path.name}”: {path.split}% split
            {path.winningDays ? `, ${path.winningDays.count} days of ${usd(money(path.winningDays.minProfit))}+` : ''}
            {path.consistency ? `, ${path.consistency.pct}% consistency` : ''}
          </li>
        ))}
      </ul>
      {rules.notes && <p className="muted small">{rules.notes}</p>}
      <p className="muted small">
        Checked {rules.source.checkedAt} ·{' '}
        <a href={rules.source.url} target="_blank" rel="noreferrer">
          source
        </a>{' '}
        · rules change often, so check your firm's page
      </p>
    </div>
  );
}

function RuleEditor({ account, store }: { account: Account; store: Store }) {
  const rules = account.rules;
  const update = (next: Partial<StageRules>) => store.updateAccount(account.id, (current) => ({ ...current, rules: { ...current.rules, ...next } }));
  return (
    <details className="panel">
      <summary>Override this account's rules</summary>
      <div className="fields">
        <label>
          Drawdown amount
          <input value={rules.drawdown.amount} onChange={(event) => update({ drawdown: { ...rules.drawdown, amount: event.target.value || '0' } })} />
        </label>
        <label>
          Drawdown type
          <select value={rules.drawdown.mode} onChange={(event) => update({ drawdown: { ...rules.drawdown, mode: event.target.value as StageRules['drawdown']['mode'] } })}>
            <option value="eod_trailing">EOD trailing</option>
            <option value="intraday_trailing">Intraday trailing</option>
            <option value="static">Static</option>
          </select>
        </label>
        <label>
          Profit target
          <input value={rules.profitTarget ?? ''} placeholder="none" onChange={(event) => update({ profitTarget: event.target.value || undefined })} />
        </label>
        <label>
          Daily loss limit
          <input
            value={rules.dailyLoss?.amount ?? ''}
            placeholder="none"
            onChange={(event) => update({ dailyLoss: event.target.value ? { amount: event.target.value, effect: rules.dailyLoss?.effect ?? 'session_lock' } : undefined })}
          />
        </label>
        <label>
          Consistency %
          <input
            value={rules.consistency?.pct ?? ''}
            placeholder="none"
            onChange={(event) =>
              update({ consistency: event.target.value ? { basis: 'total_profit', effect: 'raises_target', ...rules.consistency, pct: event.target.value } : undefined })
            }
          />
        </label>
        <label>
          Fee per contract per side
          <input value={account.feePerSide} onChange={(event) => store.updateAccount(account.id, (current) => ({ ...current, feePerSide: event.target.value || '0' }))} />
        </label>
      </div>
      <p className="muted small">Copied from the catalog version {account.catalogVersion}. Changes here only affect this account.</p>
    </details>
  );
}

function AccountDetail({ account, store }: { account: Account; store: Store }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pnl, setPnl] = useState('');
  const [payoutDate, setPayoutDate] = useState(new Date().toISOString().slice(0, 10));
  const [payoutAmount, setPayoutAmount] = useState('');
  const status = evaluate(account);
  const plan = FIRMS.flatMap((firm) => firm.plans).find((item) => item.id === account.planId);
  const nextStage = plan?.stages[plan.stages.findIndex((item) => item.stage === account.stage) + 1];
  const firm = FIRMS.find((item) => item.id === account.firmId);
  return (
    <div className="detail" data-testid="account-detail">
      <header className="detail-head">
        <div>
          <input
            className="title-input"
            aria-label="Account name"
            value={account.label}
            onChange={(event) => store.updateAccount(account.id, (current) => ({ ...current, label: event.target.value }))}
          />
          <p className="muted">
            {account.planId} · <span className="badge">{account.rules.name}</span>
            {account.externalIds.length > 0 && ` · linked to ${account.externalIds.join(', ')}`}
          </p>
        </div>
        <button type="button" className="danger-button" onClick={() => confirm(`Delete ${account.label}?`) && store.removeAccount(account.id)}>
          Delete
        </button>
      </header>
      {status.evaluation?.passed && nextStage && firm && plan && (
        <div className="callout">
          Passed. Add the {nextStage.name} account with its rules filled in?{' '}
          <button
            type="button"
            className="primary"
            onClick={() =>
              store.addAccounts([
                createAccount({ id: newId(), label: `${account.label} ${nextStage.name}`, firm, plan, stage: nextStage.stage, catalogVersion: CATALOG_VERSION, feePerSide: account.feePerSide }),
              ])
            }
          >
            Add {nextStage.name}
          </button>
        </div>
      )}
      <RulesSummary rules={account.rules} />
      <RuleEditor account={account} store={store} />
      <div className="panel">
        <h3>Daily P&amp;L</h3>
        <form
          className="inline"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pnl || Number.isNaN(Number(pnl))) return;
            store.updateAccount(account.id, (current) => setDay(current, date, pnl).account);
            setPnl('');
          }}
        >
          <input type="date" aria-label="Day" value={date} onChange={(event) => setDate(event.target.value)} />
          <input inputMode="decimal" aria-label="P&L" placeholder="P&L, e.g. 450 or -300" value={pnl} onChange={(event) => setPnl(event.target.value)} />
          <button type="submit">Save day</button>
        </form>
        {account.days.length === 0 ? (
          <p className="muted">No days yet. Type them here or import a CSV.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">Net P&amp;L</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...account.days].reverse().map((day) => {
                const net = netPnl(day, account.feePerSide);
                return (
                  <tr key={day.date}>
                    <td className="mono">{day.date}</td>
                    <td className={`num mono ${tone(net)}`}>{signed(net)}</td>
                    <td className="muted small">
                      {day.source.replace('import:', '')}
                      {day.sidesWithoutFees ? ` · fees on ${day.sidesWithoutFees} sides` : ''}
                    </td>
                    <td>
                      <button type="button" className="link" onClick={() => store.updateAccount(account.id, (current) => removeDay(current, day.date))}>
                        remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="panel">
        <h3>Payouts</h3>
        <form
          className="inline"
          onSubmit={(event) => {
            event.preventDefault();
            if (!payoutAmount || Number(payoutAmount) <= 0) return;
            store.updateAccount(account.id, (current) => addPayout(current, payoutDate, payoutAmount));
            setPayoutAmount('');
          }}
        >
          <input type="date" aria-label="Payout day" value={payoutDate} onChange={(event) => setPayoutDate(event.target.value)} />
          <input inputMode="decimal" aria-label="Payout amount" placeholder="Amount withdrawn" value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value)} />
          <button type="submit">Record payout</button>
        </form>
        {account.payouts.length === 0 ? (
          <p className="muted">No payouts recorded. Recording one starts a new payout cycle.</p>
        ) : (
          <ul className="plain">
            {account.payouts.map((payout, index) => (
              <li key={`${payout.date}-${index}`}>
                <span className="mono">{payout.date}</span> {usd(money(payout.amount))}{' '}
                <button type="button" className="link" onClick={() => store.updateAccount(account.id, (current) => removePayout(current, index))}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Accounts({ store, selected, onSelect }: { store: Store; selected: string | null; onSelect: (id: string | null) => void }) {
  const accounts = store.saved.accounts;
  const current = accounts.find((account) => account.id === selected) ?? null;
  return (
    <section className="accounts">
      <aside className="list">
        <button type="button" className={current ? '' : 'active'} onClick={() => onSelect(null)}>
          + Add account
        </button>
        {accounts.map((account) => (
          <button key={account.id} type="button" className={account.id === current?.id ? 'active' : ''} onClick={() => onSelect(account.id)}>
            {account.label}
            <span className="muted small">{account.rules.name}</span>
          </button>
        ))}
        <DataTools store={store} />
      </aside>
      {current ? <AccountDetail account={current} store={store} /> : <AddAccount store={store} onDone={onSelect} />}
    </section>
  );
}

function DataTools({ store }: { store: Store }) {
  const [message, setMessage] = useState('');
  return (
    <div className="data-tools">
      <button
        type="button"
        onClick={() => {
          const blob = new Blob([JSON.stringify(store.saved, null, 2)], { type: 'application/json' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'propfirm-calc-accounts.json';
          link.click();
          URL.revokeObjectURL(link.href);
        }}
      >
        Export all
      </button>
      <label className="file-button">
        Import file
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              store.setSaved(parseSaved(await file.text()));
              setMessage(`Loaded ${file.name}`);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : String(error));
            }
          }}
        />
      </label>
      {message && <p className="muted small">{message}</p>}
    </div>
  );
}
