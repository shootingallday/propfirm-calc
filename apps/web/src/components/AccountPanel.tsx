import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addPayout,
  CATALOG_VERSION,
  createAccount,
  findPlan,
  money,
  netPnl,
  removeDay,
  removePayout,
  setDay,
  todayIso,
  type Account,
  type PathStatus,
  type StageRules,
} from 'propfirm-calc';

import { inDays, shortDate, signed, usd } from '../format.ts';
import { openOverlay } from '../px/overlay.js';
import { toast } from '../px/toast.js';
import { allowance, changes, consistencyText, dailyLossText, drawdownText, firmOf, nextStep, planName, roomTone, series, stageTag, targetText } from '../status.ts';
import { newId, type Store } from '../store.ts';
import { Chart, Empty, Fold, Icon, Menu, Num, Signed, Stat } from '../ui.tsx';
import type { Row } from './Accounts.tsx';

const TABS = ['Overview', 'Days', 'Payouts', 'Rules'] as const;
type Tab = (typeof TABS)[number];

export function AccountPanel({ row, whatIf, store }: { row: Row; whatIf: number; store: Store; onAdd: () => void }) {
  const { account, base, shown, moved } = row;
  const [tab, setTab] = useState<Tab>('Overview');
  const [renaming, setRenaming] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const del = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tag = stageTag(account, base);
  const next = nextStep(base);
  const firm = firmOf(account);
  const plan = findPlan(account.planId);
  const nextStage = plan?.stages[plan.stages.findIndex((item) => item.stage === account.stage) + 1];
  const effects = moved ? changes(base, shown) : [];

  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open], :popover-open') && !(event.target as HTMLElement).matches('input')) location.hash = 'accounts';
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const close = () => {
    location.hash = 'accounts';
    requestAnimationFrame(() => (document.querySelector(`tr[data-id="${account.id}"]`) as HTMLElement | null)?.focus());
  };

  const used = Math.max(0, Math.min(allowance(account), allowance(account) - base.cushion.toNumber()));
  const tone = roomTone(account, base);

  return (
    <aside className="px-card panel" id="panel" aria-labelledby="panel-title" data-testid="account-panel">
      <div className="panel-top">
        <button type="button" className="px-btn" data-variant="ghost" data-size="icon" aria-label={`Close ${account.label}`} onClick={close}>
          <Icon name="close" />
        </button>
        {renaming ? (
          <input
            className="title-input"
            aria-label="Account name"
            defaultValue={account.label}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                event.currentTarget.value = account.label;
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => {
              const label = event.currentTarget.value.trim();
              setRenaming(false);
              if (label && label !== account.label) {
                store.updateAccount(account.id, (current) => ({ ...current, label }));
                toast.success(`Renamed to ${label}`);
              }
            }}
          />
        ) : (
          <h2 id="panel-title" tabIndex={-1} ref={title}>
            {account.label}
          </h2>
        )}
        <span style={{ marginInlineStart: 'auto' }} />
        <Menu label={`Actions for ${account.label}`}>
          <button className="px-menu-item" role="menuitem" type="button" onClick={() => setTimeout(() => setRenaming(true), 0)}>
            <Icon name="edit" />
            Rename
          </button>
          <div className="px-menu-sep" />
          <button className="px-menu-item" role="menuitem" type="button" data-tone="loss" onClick={() => del.current && openOverlay(del.current)}>
            <Icon name="delete" />
            Delete account…
          </button>
        </Menu>
      </div>
      <div className="row small muted">
        <span className="px-tag" data-tone={tag.tone}>
          {tag.text}
        </span>
        {firm?.name} · {planName(account)}
        {account.externalIds.length > 0 && ` · linked to ${account.externalIds.join(', ')}`}
      </div>
      {base.blown && (
        <div className="px-alert" data-tone="loss" role="status">
          <Icon name="error" />
          <div>
            <b>Blown on {shortDate(base.blown.date)}</b>
            <p>
              {base.blown.reason === 'daily_loss'
                ? `A day went past the ${usd(base.dailyLoss?.amount, 0)} daily loss limit.`
                : `The balance closed at ${usd(base.balance)}, under the ${usd(base.floor)} floor.`}
            </p>
          </div>
        </div>
      )}
      {!base.blown && base.evaluation?.passed && nextStage && firm && plan && (
        <div className="px-alert" data-tone="gain" role="status">
          <Icon name="success" />
          <div>
            <b>Passed</b>
            <p>Add the {nextStage.name} account with its rules filled in.</p>
          <button
            type="button"
            className="px-btn"
            data-variant="secondary"
            data-size="sm"
            onClick={() => {
              const created = createAccount({ id: newId(), label: `${account.label} ${nextStage.name}`, firm, plan, stage: nextStage.stage, catalogVersion: CATALOG_VERSION, feePerSide: account.feePerSide });
              store.addAccounts([created]);
              location.hash = `account/${created.id}`;
            }}
          >
            Add {nextStage.name} account
          </button>
          </div>
        </div>
      )}
      {!base.blown && !base.evaluation?.passed && (
        <div>
          <div className="next-line">{next.title}</div>
          <div className="small muted">{next.sub}</div>
          {moved && (
            <>
              <div className="small muted" style={{ marginBlockStart: 8 }}>
                If tomorrow is {signed(money(whatIf), 0)}
                {effects.length ? '' : ', nothing changes here'}
              </div>
              {effects.length > 0 && (
                <div className="fx">
                  {effects.map((effect) => (
                    <span key={effect.text} className="px-tag" data-tone={effect.tone}>
                      {effect.text}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      <div className="px-guard" data-state={base.blown ? 'breached' : tone === 'warn' ? 'near' : 'armed'} role="status">
        <div className="px-guard-head">
          <Icon name="guarded" />
          Drawdown floor {usd(base.floor)}
          <span className="px-guard-used px-num">
            {usd(money(used), 0)} of {usd(money(allowance(account)), 0)} used
          </span>
        </div>
        <div className="px-meter" data-tone={tone}>
          <i style={{ width: `${base.blown ? 100 : (used / allowance(account)) * 100}%` }} />
        </div>
        <small>{base.blown ? 'Breached' : `${usd(base.cushion, 0)} of room left${account.rules.drawdown.lockAt === 'never' ? ', and it never locks' : ''}`}</small>
      </div>
      <div className="stats">
        <Stat label="Balance">
          <Num value={base.balance} />
        </Stat>
        <Stat label="Profit">
          <Signed value={base.totalProfit} />
        </Stat>
        <Stat
          label="Best day"
          sub={
            (base.consistency ?? base.payout?.best.consistency) &&
            (() => {
              const c = (base.consistency ?? base.payout?.best.consistency)!;
              return `${c.bestDayPct.isFinite() ? c.bestDayPct.toFixed(0) : '—'}% · limit ${c.pct.toFixed(0)}%`;
            })()
          }
        >
          <Num value={base.bestDay?.pnl} />
        </Stat>
      </div>
      <div>
        <div className="px-tabs" role="tablist" aria-label="Account detail">
          {TABS.map((name, index) => (
            <button
              key={name}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              className="px-tab"
              role="tab"
              id={`tab-${name}`}
              aria-controls={`tabpanel-${name}`}
              aria-selected={tab === name}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => setTab(name)}
              onKeyDown={(event) => {
                const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                if (!step) return;
                const to = (index + step + TABS.length) % TABS.length;
                setTab(TABS[to]!);
                tabRefs.current[to]?.focus();
              }}
            >
              {name}
              {name === 'Days' && <span className="px-badge">{account.days.length}</span>}
              {name === 'Payouts' && account.payouts.length > 0 && <span className="px-badge">{account.payouts.length}</span>}
            </button>
          ))}
        </div>
        <div className="px-tabpanel tabpad" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === 'Overview' && <Overview row={row} />}
          {tab === 'Days' && <Days account={account} store={store} hits={base.dailyLoss?.hits ?? []} />}
          {tab === 'Payouts' && <Payouts account={account} store={store} />}
          {tab === 'Rules' && <Rules account={account} store={store} />}
        </div>
      </div>
      <dialog ref={del} className="px-overlay" data-overlay="dialog" role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-desc">
        <form
          method="dialog"
          className="px-panel"
          data-size="sm"
          data-tone="loss"
          onSubmit={(event) => {
            const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            if (submitter?.value !== 'delete') return;
            store.removeAccount(account.id);
            toast(`Deleted ${account.label}`, {});
            location.hash = 'accounts';
          }}
        >
          <div className="px-panel-head">
            <h2 className="px-panel-title" id="delete-title">
              Delete {account.label}?
            </h2>
          </div>
          <div className="px-panel-body">
            <p id="delete-desc">
              Its {account.days.length} days and every payout go with it. This can't be undone, so export a backup first if you might want them.
            </p>
          </div>
          <div className="px-panel-foot">
            <button className="px-btn" value="cancel" autoFocus>
              Keep account
            </button>
            <button className="px-btn" data-variant="danger" value="delete">
              Delete account
            </button>
          </div>
        </form>
      </dialog>
    </aside>
  );
}

function PathCard({ path }: { path: PathStatus }) {
  return (
    <div className="path">
      <div className="path-head">
        <b>
          {path.name} <span className="muted small">· {path.split}% split</span>
        </b>
        <span className="px-tag" data-tone={path.eligible ? 'gain' : undefined}>
          {path.eligible ? 'Ready' : Number.isFinite(path.daysToEligible) ? inDays(path.daysToEligible).replace(/^in /, 'In ') : 'Blocked'}
        </span>
      </div>
      <div className="small muted">
        Withdraw <b className="px-num" style={{ color: 'var(--foreground)' }}>{usd(path.withdrawable)}</b>, you get{' '}
        <b className="px-num" style={{ color: 'var(--foreground)' }}>{usd(path.estimatedPayout)}</b> · profit this cycle {usd(path.cycleProfit)}
        {path.cycleStart && ` since ${shortDate(path.cycleStart)}`}
      </div>
      {path.winningDaysNeeded !== null && path.winningDays !== null && (
        <>
          <div className="small muted">
            Winning days · {Math.min(path.winningDays, path.winningDaysNeeded)} of {path.winningDaysNeeded}
          </div>
          <div className="px-meter">
            <i style={{ width: `${Math.min(100, (path.winningDays / path.winningDaysNeeded) * 100)}%` }} />
          </div>
        </>
      )}
      {path.blockers.length > 0 && (
        <ul>
          {path.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Overview({ row }: { row: Row }) {
  const { account, base } = row;
  const data = useMemo(() => series(account), [account]);
  const spec = useMemo(
    () => ({
      title: 'Balance and floor',
      kind: 'line',
      labels: data.labels,
      format: 'money',
      reveal: false,
      series: [
        { name: 'Balance', values: data.balance },
        { name: 'Floor', tone: 'loss', values: data.floor },
      ],
    }),
    [data],
  );
  const evaluation = base.evaluation;
  const target = evaluation?.effectiveTarget;
  return (
    <>
      {base.payout && !base.blown && (
        <section className="stack" aria-label="Best payout path">
          <h3>Best payout path</h3>
          <PathCard path={base.payout.best} />
          {base.payout.paths.length > 1 && (
            <div className="px-accordion">
              <Fold title={`${base.payout.paths.length - 1} more ${base.payout.paths.length === 2 ? 'path' : 'paths'}`}>
                <div className="stack">
                  {base.payout.paths.slice(1).map((path) => (
                    <PathCard key={path.name} path={path} />
                  ))}
                </div>
              </Fold>
            </div>
          )}
        </section>
      )}
      {evaluation && target && (
        <section className="stack" aria-label="Evaluation">
          <h3>Evaluation</h3>
          <div className="path-head small">
            <span className="muted">
              {usd(base.totalProfit.lt(0) ? money(0) : base.totalProfit)} of the {usd(target, 0)} target
            </span>
            <span className="px-num">{usd(evaluation.profitRemaining)} to go</span>
          </div>
          <div className="px-meter">
            <i style={{ width: `${Math.max(0, Math.min(100, base.totalProfit.div(target).times(100).toNumber()))}%` }} />
          </div>
          <dl className="px-dl">
            <dt>Trading days</dt>
            <dd className="px-num">
              {evaluation.tradingDays}
              {evaluation.minTradingDays ? ` · ${evaluation.minTradingDays} needed` : ''}
            </dd>
            {base.consistency && (
              <>
                <dt>Consistency</dt>
                <dd>
                  Best day {base.consistency.bestDayPct.isFinite() ? base.consistency.bestDayPct.toFixed(0) : '—'}% of the {base.consistency.pct.toFixed(0)}% limit
                  {evaluation.effectiveTarget && evaluation.profitTarget && !evaluation.effectiveTarget.eq(evaluation.profitTarget) ? `, target raised to ${usd(evaluation.effectiveTarget)}` : ''}
                </dd>
              </>
            )}
            {evaluation.blockers.length > 0 && (
              <>
                <dt>Blocking</dt>
                <dd>{evaluation.blockers.join('; ')}</dd>
              </>
            )}
          </dl>
        </section>
      )}
      {account.days.length > 1 && (
        <section className="stack" aria-label="Balance and floor">
          <h3>Balance and floor</h3>
          <Chart spec={spec} />
        </section>
      )}
      <div className="px-accordion">
        <Fold title="More numbers">
          <dl className="px-dl">
            <dt>Peak balance</dt>
            <dd className="px-num">{usd(base.peak)}</dd>
            <dt>Total paid out</dt>
            <dd className="px-num">{usd(base.totalPaidOut)}</dd>
            <dt>Trading days</dt>
            <dd className="px-num">{base.tradingDays}</dd>
            <dt>Last day entered</dt>
            <dd>{base.lastDate ? shortDate(base.lastDate) : '—'}</dd>
            <dt>Average winning day</dt>
            <dd className="px-num">{usd(base.avgWinningDay)}</dd>
            <dt>Average used for estimates</dt>
            <dd className="px-num">{usd(base.avgDayUsed)}</dd>
            <dt>Days at the daily loss limit</dt>
            <dd>{base.dailyLoss?.hits.length ? base.dailyLoss.hits.map(shortDate).join(', ') : 'None'}</dd>
          </dl>
          {base.notes.map((note) => (
            <p key={note} className="px-hint">
              {note}
            </p>
          ))}
        </Fold>
      </div>
    </>
  );
}

function Days({ account, store, hits }: { account: Account; store: Store; hits: string[] }) {
  const [date, setDate] = useState(todayIso());
  const [pnl, setPnl] = useState('');
  return (
    <>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const value = pnl.replace(/[−–]/g, '-').replace(/[$,\s]/g, '');
          if (!value || Number.isNaN(Number(value))) return;
          store.updateAccount(account.id, (current) => setDay(current, date, value).account);
          setPnl('');
          toast.success(`Saved ${shortDate(date)}`);
        }}
      >
        <label className="px-field">
          <span className="px-label">Date</span>
          <input className="px-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="px-field">
          <span className="px-label">Net P&amp;L</span>
          <input className="px-input" inputMode="decimal" placeholder="−250.00" value={pnl} onChange={(event) => setPnl(event.target.value)} />
        </label>
        <button className="px-btn" data-variant="secondary" type="submit">
          Save day
        </button>
      </form>
      <p className="px-hint" style={{ margin: 0 }}>
        A date you already entered is replaced.
      </p>
      {account.days.length === 0 ? (
        <Empty icon="trades" title="No days yet">
          Type them here or import a CSV.
        </Empty>
      ) : (
        <table className="px-table">
          <thead>
            <tr>
              <th>Day</th>
              <th className="r">Net P&amp;L</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...account.days].reverse().map((day) => (
              <tr key={day.date}>
                <td>
                  {shortDate(day.date)}
                  <div className="acct-sub">
                    {day.source.startsWith('import:') ? day.source.slice(7) : 'Typed'}
                    {day.sidesWithoutFees ? ` · fees on ${day.sidesWithoutFees} sides` : ''}
                  </div>
                </td>
                <td className="r">
                  <Signed value={netPnl(day, account.feePerSide)} />
                  {hits.includes(day.date) && (
                    <div>
                      <span className="px-tag" data-tone="loss">
                        Daily loss limit
                      </span>
                    </div>
                  )}
                </td>
                <td className="r">
                  <button
                    type="button"
                    className="px-btn"
                    data-variant="ghost"
                    data-size="icon"
                    aria-label={`Remove ${shortDate(day.date)}`}
                    onClick={() => {
                      store.updateAccount(account.id, (current) => removeDay(current, day.date));
                      toast(`Removed ${shortDate(day.date)}`, {
                        action: { label: 'Undo', onClick: () => store.updateAccount(account.id, (current) => setDay(current, day.date, day.pnl).account) },
                      });
                    }}
                  >
                    <Icon name="delete" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Payouts({ account, store }: { account: Account; store: Store }) {
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  return (
    <>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const value = amount.replace(/[$,\s]/g, '');
          if (!value || !(Number(value) > 0)) return;
          store.updateAccount(account.id, (current) => addPayout(current, date, value));
          setAmount('');
          toast.success(`Recorded ${usd(money(value))}`);
        }}
      >
        <label className="px-field">
          <span className="px-label">Date</span>
          <input className="px-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="px-field">
          <span className="px-label">Amount</span>
          <input className="px-input" inputMode="decimal" placeholder="1,000.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <button className="px-btn" data-variant="secondary" type="submit">
          Record payout
        </button>
      </form>
      {account.payouts.length === 0 ? (
        <Empty icon="reports" title="No payouts recorded">
          Recording one starts a new payout cycle.
        </Empty>
      ) : (
        <table className="px-table">
          <thead>
            <tr>
              <th>Day</th>
              <th className="r">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {account.payouts.map((payout, index) => (
              <tr key={`${payout.date}-${index}`}>
                <td>{shortDate(payout.date)}</td>
                <td className="r">
                  <Num value={money(payout.amount)} />
                </td>
                <td className="r">
                  <button
                    type="button"
                    className="px-btn"
                    data-variant="ghost"
                    data-size="icon"
                    aria-label={`Remove the ${shortDate(payout.date)} payout`}
                    onClick={() => {
                      store.updateAccount(account.id, (current) => removePayout(current, index));
                      toast(`Removed the ${shortDate(payout.date)} payout`, {
                        action: { label: 'Undo', onClick: () => store.updateAccount(account.id, (current) => addPayout(current, payout.date, payout.amount)) },
                      });
                    }}
                  >
                    <Icon name="delete" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Rules({ account, store }: { account: Account; store: Store }) {
  const rules = account.rules;
  const firm = firmOf(account);
  const update = (next: Partial<StageRules>) => store.updateAccount(account.id, (current) => ({ ...current, rules: { ...current.rules, ...next } }));
  return (
    <>
      <dl className="px-dl">
        <dt>Drawdown</dt>
        <dd>{drawdownText(rules)}</dd>
        <dt>Profit target</dt>
        <dd>{targetText(rules)}</dd>
        <dt>Daily loss limit</dt>
        <dd>{dailyLossText(rules)}</dd>
        <dt>Consistency</dt>
        <dd>{consistencyText(rules)}</dd>
        {rules.payoutPaths && rules.payoutPaths.length > 0 && (
          <>
            <dt>Payout paths</dt>
            <dd>
              {rules.payoutPaths.map((path) => (
                <div key={path.name}>
                  {path.name}, {path.split}% split
                  {path.winningDays ? `, ${path.winningDays.count} days of ${usd(money(path.winningDays.minProfit), 0)}+` : ''}
                </div>
              ))}
            </dd>
          </>
        )}
      </dl>
      <p className="small muted">
        Checked {shortDate(rules.source.checkedAt)} ·{' '}
        <a className="px-link" href={rules.source.url} target="_blank" rel="noreferrer">
          {firm?.name ?? 'Firm'} rules
        </a>
        . Firms change rules every few months.
      </p>
      <div className="px-accordion">
        {rules.notes && (
          <Fold title="Firm notes">
            <p className="small">{rules.notes}</p>
          </Fold>
        )}
        <Fold title="Override this account's rules">
          <div className="stack">
            <div className="fields">
              <label className="px-field">
                <span className="px-label">Drawdown</span>
                <input className="px-input" inputMode="decimal" value={rules.drawdown.amount} onChange={(event) => update({ drawdown: { ...rules.drawdown, amount: event.target.value || '0' } })} />
              </label>
              <label className="px-field">
                <span className="px-label">Drawdown type</span>
                <select className="px-input" value={rules.drawdown.mode} onChange={(event) => update({ drawdown: { ...rules.drawdown, mode: event.target.value as StageRules['drawdown']['mode'] } })}>
                  <option value="eod_trailing">End-of-day trailing</option>
                  <option value="intraday_trailing">Intraday trailing</option>
                  <option value="static">Static</option>
                </select>
              </label>
              <label className="px-field">
                <span className="px-label">Profit target</span>
                <input className="px-input" inputMode="decimal" value={rules.profitTarget ?? ''} placeholder="None" onChange={(event) => update({ profitTarget: event.target.value || undefined })} />
              </label>
              <label className="px-field">
                <span className="px-label">Daily loss limit</span>
                <input
                  className="px-input"
                  inputMode="decimal"
                  value={rules.dailyLoss?.amount ?? ''}
                  placeholder="None"
                  onChange={(event) => update({ dailyLoss: event.target.value ? { amount: event.target.value, effect: rules.dailyLoss?.effect ?? 'session_lock' } : undefined })}
                />
              </label>
              <label className="px-field">
                <span className="px-label">Consistency %</span>
                <input
                  className="px-input"
                  inputMode="decimal"
                  value={rules.consistency?.pct ?? ''}
                  placeholder="None"
                  onChange={(event) => update({ consistency: event.target.value ? { basis: 'total_profit', effect: 'raises_target', ...rules.consistency, pct: event.target.value } : undefined })}
                />
              </label>
              <label className="px-field">
                <span className="px-label">Fee per contract per side</span>
                <input className="px-input" inputMode="decimal" value={account.feePerSide} onChange={(event) => store.updateAccount(account.id, (current) => ({ ...current, feePerSide: event.target.value || '0' }))} />
              </label>
            </div>
            <p className="px-hint" style={{ margin: 0 }}>
              Copied from catalog version {account.catalogVersion}. Changes only this account.
            </p>
          </div>
        </Fold>
      </div>
    </>
  );
}
