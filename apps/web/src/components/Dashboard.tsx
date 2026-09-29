import { useMemo, useState } from 'react';
import { evaluate, findPlan, money, type Account, type AccountStatus, type Money } from 'propfirm-calc';

import { inDays, signed, tone, usd } from '../format.ts';
import type { Store } from '../store.ts';

function NumberLine({ status }: { status: AccountStatus }) {
  const floor = status.floor;
  const target = status.evaluation?.effectiveTarget
    ? status.startingBalance.plus(status.evaluation.effectiveTarget)
    : status.peak.plus(status.startingBalance.minus(floor).abs());
  const low = floor.minus(target.minus(floor).times(0.05));
  const high = target;
  const span = high.minus(low);
  const at = (value: Money) => {
    const ratio = span.lte(0) ? 0 : value.minus(low).div(span).toNumber();
    return `${Math.min(100, Math.max(0, ratio * 100))}%`;
  };
  return (
    <div className="line" aria-label={`Balance ${usd(status.balance)} between floor ${usd(floor)} and ${usd(target)}`}>
      <div className="line-track" />
      <div className="line-mark floor" style={{ left: at(floor) }} title={`Floor ${usd(floor)}`} />
      <div className="line-mark start" style={{ left: at(status.startingBalance) }} title={`Start ${usd(status.startingBalance)}`} />
      <div className={`line-dot ${status.blown ? 'blown' : ''}`} style={{ left: at(status.balance) }} title={`Balance ${usd(status.balance)}`} />
      <div className="line-labels">
        <span>floor {usd(floor)}</span>
        <span>{status.evaluation?.effectiveTarget ? `target ${usd(target)}` : `peak ${usd(status.peak)}`}</span>
      </div>
    </div>
  );
}

function nextStep(status: AccountStatus): string {
  if (status.blown) return `Blown on ${status.blown.date} (${status.blown.reason === 'daily_loss' ? 'daily loss limit' : 'drawdown'})`;
  if (status.payout) {
    const best = status.payout.best;
    return best.eligible
      ? `Payout ready via ${best.name}: about ${usd(best.estimatedPayout)} to you`
      : `Payout ${inDays(best.daysToEligible)} via ${best.name}`;
  }
  if (status.evaluation) return status.evaluation.passed ? 'Passed' : `Pass ${inDays(status.evaluation.daysToPass)}`;
  return 'No payout rules for this stage';
}

function changes(before: AccountStatus, after: AccountStatus): string[] {
  const notes: string[] = [];
  if (!before.blown && after.blown) notes.push(after.blown.reason === 'daily_loss' ? 'Breaks the daily loss limit' : 'Blows the account');
  if (before.consistency?.ok && after.consistency && !after.consistency.ok) notes.push('Breaks consistency');
  if (before.consistency && !before.consistency.ok && after.consistency?.ok) notes.push('Fixes consistency');
  if (before.evaluation && after.evaluation && !before.evaluation.passed && after.evaluation.passed) notes.push('Passes the evaluation');
  if (before.payout && after.payout && !before.payout.best.eligible && after.payout.best.eligible) notes.push(`Unlocks a payout (${after.payout.best.name})`);
  if (before.payout && after.payout && before.payout.best.eligible && !after.payout.best.eligible) notes.push('Loses payout eligibility');
  if (after.dailyLoss && after.whatIf && after.dailyLoss.hits.includes(after.whatIf.date) && after.dailyLoss.effect === 'session_lock') notes.push('Hits the daily loss lock');
  return notes;
}

function AccountCard({ account, whatIf, store }: { account: Account; whatIf: number; store: Store }) {
  const base = useMemo(() => evaluate(account), [account]);
  const moved = useMemo(() => (whatIf === 0 || !account.included ? null : evaluate(account, { whatIf })), [account, whatIf]);
  const shown = moved ?? base;
  const notes = moved ? changes(base, moved) : [];
  const plan = findPlan(account.planId);
  const consistency = shown.consistency ?? shown.payout?.best.consistency ?? null;
  return (
    <article className={`card ${shown.blown ? 'is-blown' : ''} ${account.included ? '' : 'is-excluded'}`} data-testid="account-card">
      <header className="card-head">
        <div>
          <h3>{account.label}</h3>
          <p className="muted">
            {plan ? `${plan.program} ${usd(money(plan.size))}` : account.planId} · <span className="badge">{account.rules.name}</span>
          </p>
        </div>
        <label className="toggle" title="Include in the what-if slider">
          <input
            type="checkbox"
            checked={account.included}
            onChange={(event) => store.updateAccount(account.id, (current) => ({ ...current, included: event.target.checked }))}
          />
          what-if
        </label>
      </header>
      <NumberLine status={shown} />
      <dl className="figures">
        <div>
          <dt>Balance</dt>
          <dd className="mono">{usd(shown.balance)}</dd>
        </div>
        <div>
          <dt>Cushion</dt>
          <dd className={`mono ${shown.cushion.lte(0) ? 'danger' : ''}`}>{usd(shown.cushion)}</dd>
        </div>
        <div>
          <dt>Profit</dt>
          <dd className={`mono ${tone(shown.totalProfit)}`}>{signed(shown.totalProfit)}</dd>
        </div>
        <div>
          <dt>Best day</dt>
          <dd className="mono">{shown.bestDay ? usd(shown.bestDay.pnl) : '—'}
            {shown.bestDay && consistency && <span className="muted"> · {consistency.bestDayPct.isFinite() ? consistency.bestDayPct.toFixed(0) : '∞'}%</span>}</dd>
        </div>
      </dl>
      {consistency && (
        <p className={`rule ${consistency.ok ? '' : 'rule-blocked'}`}>
          Consistency {consistency.pct.toFixed(0)}%: {consistency.ok ? 'within the limit' : consistency.requiredTotal ? `needs ${usd(consistency.requiredTotal)} total profit` : 'best day over the cap'}
        </p>
      )}
      <p className="next">{nextStep(shown)}</p>
      {shown.notes.map((note) => (
        <p key={note} className="muted small note">
          {note}
        </p>
      ))}
      {moved && (
        <div className="whatif" data-testid="whatif-notes">
          <strong>If tomorrow is {signed(money(whatIf))}:</strong> {notes.length ? notes.join(' · ') : 'nothing changes status'}
        </div>
      )}
    </article>
  );
}

export function Dashboard({ store, onAdd }: { store: Store; onAdd: () => void }) {
  const [whatIf, setWhatIf] = useState(0);
  const accounts = store.saved.accounts;
  if (accounts.length === 0) {
    return (
      <section className="empty">
        <h2>No accounts yet</h2>
        <p>Pick your accounts from the firm list, then type or import your daily P&amp;L.</p>
        <button type="button" className="primary" onClick={onAdd}>
          Add an account
        </button>
      </section>
    );
  }
  const statuses = accounts.map((account) => evaluate(account));
  const total = statuses.reduce((sum, status) => sum.plus(status.totalProfit), money(0));
  const blown = statuses.filter((status) => status.blown).length;
  const ready = statuses.filter((status) => status.payout?.best.eligible).length;
  return (
    <section>
      <div className="summary">
        <div>
          <span className="muted">Accounts</span>
          <strong>{accounts.length}</strong>
        </div>
        <div>
          <span className="muted">Net profit</span>
          <strong className={tone(total)}>{signed(total)}</strong>
        </div>
        <div>
          <span className="muted">Payouts ready</span>
          <strong>{ready}</strong>
        </div>
        <div>
          <span className="muted">Blown</span>
          <strong>{blown}</strong>
        </div>
      </div>
      <div className="slider">
        <label htmlFor="whatif">
          What if tomorrow is <strong className={`mono ${whatIf > 0 ? 'gain' : whatIf < 0 ? 'loss' : ''}`}>{signed(money(whatIf))}</strong> on every included account?
        </label>
        <input id="whatif" type="range" min={-3000} max={3000} step={50} value={whatIf} onChange={(event) => setWhatIf(Number(event.target.value))} />
        <div className="slider-scale muted">
          <span>-$3,000</span>
          <button type="button" className="link" onClick={() => setWhatIf(0)}>
            reset
          </button>
          <span>+$3,000</span>
        </div>
      </div>
      <div className="grid">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} whatIf={whatIf} store={store} />
        ))}
      </div>
    </section>
  );
}
