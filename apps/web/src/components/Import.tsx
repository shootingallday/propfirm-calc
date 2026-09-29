import { useState } from 'react';
import { applyImport, importCsv, matchImportedAccount, money, sum, type ImportResult } from 'propfirm-calc';

import { shortDate } from '../format.ts';
import type { Store } from '../store.ts';
import { Fold, Icon, PageHead, Signed } from '../ui.tsx';

type Loaded = { name: string; result: ImportResult };

export function Import({ store, onAdd }: { store: Store; onAdd: () => void }) {
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [errors, setErrors] = useState<{ name: string; message: string }[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const accounts = store.saved.accounts;

  async function read(files: File[]) {
    if (!files.length) return;
    const next: Loaded[] = [];
    const failed: { name: string; message: string }[] = [];
    for (const file of files) {
      try {
        next.push({ name: file.name, result: importCsv(await file.text()) });
      } catch (error) {
        failed.push({ name: file.name, message: error instanceof Error ? error.message : String(error) });
      }
    }
    setLoaded(next);
    setErrors(failed);
    setLog([]);
    const picks: Record<string, string> = {};
    next.forEach((file, fileIndex) =>
      file.result.accounts.forEach((imported, index) => {
        picks[`${fileIndex}:${index}`] = matchImportedAccount(accounts, imported.externalId)?.id ?? '';
      }),
    );
    setChoice(picks);
  }

  const picked = Object.values(choice).filter(Boolean);
  const dayCount = loaded.reduce(
    (total, file, fileIndex) => total + file.result.accounts.reduce((count, imported, index) => count + (choice[`${fileIndex}:${index}`] ? imported.days.length : 0), 0),
    0,
  );

  function apply() {
    const lines: string[] = [];
    const next = [...accounts];
    loaded.forEach((file, fileIndex) =>
      file.result.accounts.forEach((imported, index) => {
        const at = next.findIndex((account) => account.id === choice[`${fileIndex}:${index}`]);
        if (at < 0) return;
        const account = next[at]!;
        const result = applyImport(account, imported, file.result.layout);
        next[at] = result.account;
        const replaced = result.replaced.length ? `, replaced ${result.replaced.length} (${result.replaced.map(shortDate).join(', ')})` : '';
        lines.push(`${account.label}: added ${result.added.length} ${result.added.length === 1 ? 'day' : 'days'}${replaced}${result.payoutsAdded ? `, ${result.payoutsAdded} payouts` : ''}.`);
      }),
    );
    store.setSaved((current) => ({ ...current, accounts: next }));
    setLog(lines);
    setLoaded([]);
  }

  return (
    <div className="narrow">
      <PageHead title="Import">Tradovate Fills, Performance, Account Balance History and Cash History, and TopstepX Orders and Trades. Files never leave this browser.</PageHead>
      <label
        className="ui-drop"
        data-state={over ? 'over' : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          read([...event.dataTransfer.files]);
        }}
      >
        <span>
          <b>Drop exports here</b> or browse
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          data-testid="csv-input"
          onChange={(event) => {
            read([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
        <span className="ui-drop-note">Several at once. From TopstepX, export Orders: Trades can drop round trips.</span>
      </label>
      <div className="stack" style={{ marginBlockStart: 'var(--card-gap)' }}>
        {log.length > 0 && (
          <div className="ui-alert" data-tone="gain" role="status" data-testid="import-log">
            <Icon name="success" />
            <div>
              <b>Imported</b>
              {log.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <a className="ui-btn" data-variant="secondary" data-size="sm" href="#accounts">
              See accounts
            </a>
          </div>
        )}
        {loaded.map((file, fileIndex) => (
          <div className="ui-card" key={file.name}>
            <div className="ui-card-title row" style={{ padding: 'var(--ui-space-3) var(--cell-px) 0' }}>
              <Icon name="trades" />
              {file.name}
              <span className="ui-tag">{file.result.label}</span>
            </div>
            <div style={{ overflowX: 'auto', padding: 'var(--ui-space-2) var(--cell-px) var(--ui-space-3)' }}>
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>In the file</th>
                    <th className="r">Days</th>
                    <th className="r col-profit">Net P&amp;L</th>
                    <th>Goes into</th>
                  </tr>
                </thead>
                <tbody>
                  {file.result.accounts.map((imported, index) => {
                    const key = `${fileIndex}:${index}`;
                    const matched = matchImportedAccount(accounts, imported.externalId);
                    const name = imported.externalId ?? 'No account named';
                    return (
                      <tr key={key}>
                        <td>
                          {name}
                          <div className="acct-sub">
                            {imported.days.length ? `${shortDate(imported.days[0]!.date)} – ${shortDate(imported.days.at(-1)!.date)}` : 'No days'}
                            {imported.payouts.length ? ` · ${imported.payouts.length} ${imported.payouts.length === 1 ? 'payout' : 'payouts'}` : ''}
                          </div>
                        </td>
                        <td className="r ui-num">{imported.days.length}</td>
                        <td className="r col-profit">
                          <Signed value={sum(imported.days.map((day) => money(day.pnl)))} />
                        </td>
                        <td>
                          <select className="ui-input" aria-label={`Goes into, for ${name}`} value={choice[key] ?? ''} onChange={(event) => setChoice({ ...choice, [key]: event.target.value })}>
                            <option value="">Skip</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.label}
                              </option>
                            ))}
                          </select>
                          {matched && choice[key] === matched.id && <div className="acct-sub">Matched before</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {file.result.warnings.length > 0 && (
              <div className="ui-accordion">
                <Fold title={`${file.result.warnings.length} ${file.result.warnings.length === 1 ? 'warning' : 'warnings'}`}>
                  {file.result.warnings.map((warning) => (
                    <p key={warning} className="small">
                      {warning}
                    </p>
                  ))}
                </Fold>
              </div>
            )}
          </div>
        ))}
        {errors.map((error) => (
          <div key={error.name} className="ui-alert" data-tone="loss" role="alert">
            <Icon name="error" />
            <div>
              <b>{error.name} wasn't read</b>
              <p>{error.message}</p>
            </div>
          </div>
        ))}
        {loaded.length > 0 && (
          <div className="row">
            <button type="button" className="ui-btn" data-variant="primary" disabled={!picked.length} onClick={apply}>
              {picked.length ? `Import ${dayCount} ${dayCount === 1 ? 'day' : 'days'} into ${new Set(picked).size} ${new Set(picked).size === 1 ? 'account' : 'accounts'}` : 'Pick an account to import into'}
            </button>
            {accounts.length === 0 && (
              <button type="button" className="ui-btn" data-variant="secondary" onClick={onAdd}>
                Add an account to import into
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
