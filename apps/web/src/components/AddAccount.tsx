import { useEffect, useRef, useState } from 'react';
import { CATALOG_VERSION, createAccount, FIRMS, money, type Stage } from 'propfirm-calc';

import { shortDate, usd } from '../format.ts';
import { openOverlay } from '../px/overlay.js';
import { toast } from '../px/toast.js';
import { consistencyText, dailyLossText, drawdownText, targetText } from '../status.ts';
import { newId, type Store } from '../store.ts';

export function AddAccount({ store, onClose }: { store: Store; onClose: (id?: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [firmId, setFirmId] = useState(FIRMS[0]!.id);
  const firm = FIRMS.find((item) => item.id === firmId)!;
  const [planId, setPlanId] = useState(firm.plans[0]!.id);
  const plan = firm.plans.find((item) => item.id === planId) ?? firm.plans[0]!;
  const [stage, setStage] = useState<Stage>(plan.stages[0]!.stage);
  const rules = plan.stages.find((item) => item.stage === stage) ?? plan.stages[0]!;
  const [label, setLabel] = useState('');
  const [fee, setFee] = useState('0');
  const fallback = `${firm.name} ${plan.program} ${plan.size / 1000}K`;
  const added = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) openOverlay(dialog.current);
  }, []);

  return (
    <dialog ref={dialog} className="px-overlay" data-overlay="dialog" closedby="any" aria-labelledby="add-title" onClose={() => onClose(added.current)}>
      <form
        method="dialog"
        className="px-panel"
        data-size="md"
        onSubmit={(event) => {
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          if (submitter?.value !== 'add') return;
          const account = createAccount({ id: newId(), label: label.trim() || fallback, firm, plan, stage: rules.stage, catalogVersion: CATALOG_VERSION, feePerSide: fee || '0' });
          store.addAccounts([account]);
          added.current = account.id;
          toast.success(`Added ${account.label}`);
        }}
      >
        <div className="px-panel-head">
          <h2 className="px-panel-title" id="add-title">
            Add an account
          </h2>
        </div>
        <div className="px-panel-body stack">
          <div className="fields">
            <label className="px-field">
              <span className="px-label">Firm</span>
              <select
                className="px-input"
                value={firmId}
                onChange={(event) => {
                  const next = FIRMS.find((item) => item.id === event.target.value)!;
                  setFirmId(next.id);
                  setPlanId(next.plans[0]!.id);
                  setStage(next.plans[0]!.stages[0]!.stage);
                }}
              >
                {FIRMS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="px-field">
              <span className="px-label">Stage</span>
              <select className="px-input" value={rules.stage} onChange={(event) => setStage(event.target.value as Stage)}>
                {plan.stages.map((item) => (
                  <option key={item.stage} value={item.stage}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="px-field">
            <span className="px-label">Plan</span>
            <select
              className="px-input"
              value={plan.id}
              onChange={(event) => {
                const next = firm.plans.find((item) => item.id === event.target.value)!;
                setPlanId(next.id);
                setStage(next.stages[0]!.stage);
              }}
            >
              {firm.plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.program} · {usd(money(item.size), 0)}
                </option>
              ))}
            </select>
          </label>
          <div className="fields">
            <label className="px-field">
              <span className="px-label">
                Name <span className="muted">(optional)</span>
              </span>
              <input className="px-input" placeholder={fallback} value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <label className="px-field">
              <span className="px-label">Fee per contract per side</span>
              <input className="px-input" inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} />
            </label>
          </div>
          <div className="px-card" style={{ padding: 'var(--px-space-3) var(--cell-px)' }}>
            <div className="path-head small">
              <b>Rules for this plan</b>
              <a className="px-link" href={rules.source.url} target="_blank" rel="noreferrer">
                Checked {shortDate(rules.source.checkedAt)}
              </a>
            </div>
            <dl className="px-dl">
              <dt>Drawdown</dt>
              <dd>{drawdownText(rules)}</dd>
              <dt>Profit target</dt>
              <dd>{targetText(rules)}</dd>
              <dt>Daily loss limit</dt>
              <dd>{dailyLossText(rules)}</dd>
              <dt>Consistency</dt>
              <dd>{consistencyText(rules)}</dd>
              {rules.payoutPaths && (
                <>
                  <dt>Payout paths</dt>
                  <dd>{rules.payoutPaths.map((path) => `${path.name}, ${path.split}%`).join(' · ')}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
        <div className="px-panel-foot">
          <button className="px-btn" value="cancel" formNoValidate>
            Cancel
          </button>
          <button className="px-btn" data-variant="primary" value="add">
            Add account
          </button>
        </div>
      </form>
    </dialog>
  );
}
