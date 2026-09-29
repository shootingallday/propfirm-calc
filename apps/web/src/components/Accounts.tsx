import { useMemo, useRef, useState } from 'react';
import { evaluate, money, sum, type Account, type AccountStatus } from 'propfirm-calc';

import { loadDemo } from '../demo.ts';
import { signed, usd } from '../format.ts';
import { toast } from '../px/toast.js';
import { allowance, changes, nextStep, roomTone, stageTag } from '../status.ts';
import { EMPTY, parseSaved, type Store } from '../store.ts';
import { Empty, Icon, Menu, Num, PageHead, Signed } from '../ui.tsx';
import { AccountPanel } from './AccountPanel.tsx';

export type Row = { account: Account; base: AccountStatus; shown: AccountStatus; moved: boolean };

function exportBackup(store: Store) {
  const { demo: _demo, ...saved } = store.saved;
  const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'propfirm-calc-accounts.json';
  link.click();
  URL.revokeObjectURL(link.href);
  toast.success('Saved propfirm-calc-accounts.json');
}

export function Accounts({ store, openId, onAdd }: { store: Store; openId: string | null; onAdd: () => void }) {
  const [whatIf, setWhatIf] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const accounts = store.saved.accounts;
  const rows: Row[] = useMemo(
    () =>
      accounts.map((account) => {
        const base = evaluate(account);
        const moved = whatIf !== 0 && account.included && !base.blown;
        return { account, base, shown: moved ? evaluate(account, { whatIf }) : base, moved };
      }),
    [accounts, whatIf],
  );
  const open = rows.find((row) => row.account.id === openId) ?? null;

  const backupInput = (
    <input
      ref={file}
      type="file"
      accept="application/json,.json"
      hidden
      onChange={async (event) => {
        const picked = event.target.files?.[0];
        event.target.value = '';
        if (!picked) return;
        try {
          store.setSaved(parseSaved(await picked.text()));
          toast.success(`Loaded ${picked.name}`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error));
        }
      }}
    />
  );

  if (accounts.length === 0) {
    return (
      <div className="narrow">
        <div className="px-card">
          <Empty
            icon="account"
            title="No accounts yet"
            actions={
              <>
                <button type="button" className="px-btn" data-variant="primary" onClick={onAdd}>
                  Add an account
                </button>
                <button type="button" className="px-btn" data-variant="secondary" onClick={() => store.setSaved(loadDemo())}>
                  Load demo accounts
                </button>
                <button type="button" className="px-btn" data-variant="ghost" onClick={() => file.current?.click()}>
                  Load a backup
                </button>
              </>
            }
          >
            Add each prop firm account you trade, then type your daily P&amp;L or import a CSV. Everything stays in this browser.
          </Empty>
        </div>
        {backupInput}
      </div>
    );
  }

  const net = sum(rows.map((row) => row.base.totalProfit));
  const ready = rows.filter((row) => row.base.payout?.best.eligible && !row.base.blown).length;
  const blown = rows.filter((row) => row.base.blown).length;
  const live = rows.filter((row) => !row.base.blown);
  const included = live.filter((row) => row.account.included).length;
  const capped = rows.some((row) => row.moved && row.shown.whatIf && !row.shown.whatIf.pnl.eq(whatIf));
  const at = (whatIf + 3000) / 60;

  const go = (id: string) => {
    location.hash = `account/${id}`;
  };

  return (
    <>
      {store.saved.demo && (
        <div className="px-alert demo-bar" role="status">
          <Icon name="info" />
          <p>
            <b>You're looking at demo accounts.</b> Five made-up 50K accounts, one per firm, with their last few weeks of trading. Change anything; it only lives in this browser.
          </p>
          <button type="button" className="px-btn" data-variant="secondary" data-size="sm" onClick={() => store.setSaved(EMPTY)}>
            Start with my own accounts
          </button>
        </div>
      )}
      <PageHead
        title="Accounts"
        end={
          <Menu label="More account actions" variant="secondary">
            <a className="px-menu-item" role="menuitem" href="#import">
              <Icon name="import" />
              Import a CSV
            </a>
            <div className="px-menu-sep" />
            <button className="px-menu-item" role="menuitem" type="button" onClick={() => exportBackup(store)}>
              <Icon name="export" />
              Export a backup
            </button>
            <button className="px-menu-item" role="menuitem" type="button" onClick={() => file.current?.click()}>
              <Icon name="import" />
              Load a backup
            </button>
          </Menu>
        }
      >
        <span className="px-num">{accounts.length}</span> {accounts.length === 1 ? 'account' : 'accounts'} · <Signed value={net} /> net · {ready} payout {ready === 1 ? 'ready' : 'ready'} · {blown} blown
      </PageHead>
      {backupInput}
      <div className={`desk ${open ? 'open' : ''}`}>
        <div className="stack">
          <section className="px-card whatif" aria-label="What if">
            <div>
              <div className="px-label" style={{ margin: 0 }}>
                What if tomorrow is
              </div>
              <div className="x px-num" data-testid="whatif-value">
                {signed(money(whatIf), 0)}
              </div>
            </div>
            <div className="px-slider" style={{ '--px-from': `${Math.min(50, at)}%`, '--px-to': `${Math.max(50, at)}%` } as React.CSSProperties}>
              <div className="px-slider-track">
                <i className="px-slider-fill" />
              </div>
              <input
                id="whatif"
                type="range"
                min={-3000}
                max={3000}
                step={50}
                value={whatIf}
                aria-label="Tomorrow's P&L on every included account"
                aria-valuetext={signed(money(whatIf), 0)}
                onChange={(event) => setWhatIf(Number(event.target.value))}
              />
            </div>
            <Included store={store} rows={rows} included={included} total={live.length} />
            <button type="button" className="px-btn" data-variant="secondary" data-size="sm" hidden={whatIf === 0} onClick={() => setWhatIf(0)}>
              Reset
            </button>
            <p className="px-hint" style={{ gridColumn: '1/-1', margin: 0 }} hidden={!capped}>
              Capped at the daily loss limit on accounts whose firm stops you for the day.
            </p>
          </section>
          <div className="px-card acct-table">
            <table className="px-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Room above the floor</th>
                  <th className="r col-balance">Balance</th>
                  <th className="r col-profit">Profit</th>
                  <th className="col-best">Next</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <AccountRow key={row.account.id} row={row} whatIf={whatIf} selected={row.account.id === openId} onOpen={go} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {open && <AccountPanel key={open.account.id} row={open} whatIf={whatIf} store={store} onAdd={onAdd} />}
      </div>
    </>
  );
}

function Included({ store, rows, included, total }: { store: Store; rows: Row[]; included: number; total: number }) {
  return (
    <>
      <button type="button" className="px-btn px-anchor" data-variant="ghost" data-size="sm" popoverTarget="inc-pop">
        {included} of {total} accounts
        <Icon name="chevron-down" />
      </button>
      <div className="px-popover px-overlay" data-overlay="popover" popover="auto" id="inc-pop" aria-label="Accounts in the what-if">
        <div className="px-popover-title">Include in the what-if</div>
        <div className="px-choices">
          {rows.map(({ account, base }) => (
            <label key={account.id} className="px-choice">
              <input
                className="px-check"
                type="checkbox"
                checked={account.included && !base.blown}
                disabled={!!base.blown}
                onChange={(event) => store.updateAccount(account.id, (current) => ({ ...current, included: event.target.checked }))}
              />
              {account.label}
              {base.blown && <small>Blown, so nothing changes</small>}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

function AccountRow({ row, whatIf, selected, onOpen }: { row: Row; whatIf: number; selected: boolean; onOpen: (id: string) => void }) {
  const { account, base, shown, moved } = row;
  const tag = stageTag(account, base);
  const next = nextStep(base);
  const out = !account.included && !base.blown;
  const room = shown.cushion.lt(0) ? money(0) : shown.cushion;
  const meter = base.blown ? 100 : Math.max(2, Math.min(100, (room.toNumber() / allowance(account)) * 100));
  const tone = roomTone(account, shown);
  const effects = moved ? changes(base, shown) : [];
  return (
    <tr
      tabIndex={0}
      data-id={account.id}
      data-testid="account-row"
      aria-selected={selected}
      className={out ? 'left-out' : undefined}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('input,button,select,a,label')) onOpen(account.id);
      }}
      onKeyDown={(event) => {
        const tr = event.currentTarget;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(account.id);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          ((event.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling) as HTMLElement | null)?.focus();
        }
      }}
    >
      <td>
        <div className="acct-name">{account.label}</div>
        <div className="row" style={{ marginBlockStart: 4 }}>
          <span className="px-tag" data-tone={tag.tone}>
            {tag.text}
          </span>
          {out && <span className="acct-sub">· left out of the what-if</span>}
        </div>
      </td>
      <td>
        <div className="room">
          <span className="px-num">{base.blown ? `Under by ${usd(base.floor.minus(base.balance), 0)}` : usd(room, 0)}</span>
          <div className="px-meter" data-tone={tone}>
            <i style={{ width: `${meter}%`, animation: 'none' }} />
          </div>
        </div>
      </td>
      <td className="r col-balance">
        <Num value={shown.balance} />
        {moved && shown.whatIf && (
          <div className="acct-sub">
            <Signed value={shown.whatIf.pnl} />
          </div>
        )}
      </td>
      <td className="r col-profit">
        <Signed value={base.totalProfit} />
      </td>
      <td className="col-best">
        <div>{next.title}</div>
        <div className="acct-sub">{next.sub}</div>
        {whatIf !== 0 && effects.length > 0 && (
          <div className="fx" data-testid="whatif-effects">
            {effects.map((effect) => (
              <span key={effect.text} className="px-tag" data-tone={effect.tone}>
                {effect.text}
              </span>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}
