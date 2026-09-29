import { useState } from 'react';
import { applyImport, importCsv, matchImportedAccount, money, sum, type ImportResult } from 'propfirm-calc';

import { signed, tone } from '../format.ts';
import type { Store } from '../store.ts';

type Loaded = { name: string; result: ImportResult };

export function Import({ store }: { store: Store }) {
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[]>([]);
  const accounts = store.saved.accounts;

  async function read(files: FileList | null) {
    if (!files) return;
    const next: Loaded[] = [];
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      try {
        next.push({ name: file.name, result: importCsv(await file.text()) });
      } catch (error) {
        failed.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    setLoaded(next);
    setErrors(failed);
    setLog([]);
    const picks: Record<string, string> = {};
    next.forEach((file, fileIndex) =>
      file.result.accounts.forEach((imported, index) => {
        const match = matchImportedAccount(accounts, imported.externalId);
        picks[`${fileIndex}:${index}`] = match?.id ?? '';
      }),
    );
    setChoice(picks);
  }

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
        const replaced = result.replaced.length ? `, replaced ${result.replaced.length} (${result.replaced[0]}${result.replaced.length > 1 ? ` to ${result.replaced.at(-1)}` : ''})` : '';
        lines.push(`${account.label}: added ${result.added.length} days${replaced}${result.payoutsAdded ? `, ${result.payoutsAdded} payouts` : ''}`);
      }),
    );
    store.setSaved((current) => ({ ...current, accounts: next }));
    setLog(lines.length ? lines : ['Nothing applied. Pick an account for each row first.']);
  }

  return (
    <section className="import">
      <div className="panel">
        <h2>Import a CSV</h2>
        <p className="muted">
          Tradovate: Fills, Performance, Account Balance History, Cash History. TopstepX: Orders, Trades. For TopstepX, use Orders: the Trades export can leave out round trips. Files are read in your browser and never uploaded.
        </p>
        <label className="drop">
          <input type="file" accept=".csv,text/csv" multiple onChange={(event) => read(event.target.files)} data-testid="csv-input" />
          Choose or drop CSV files
        </label>
        {errors.map((error) => (
          <p key={error} className="error">
            {error}
          </p>
        ))}
      </div>
      {loaded.map((file, fileIndex) => (
        <div className="panel" key={file.name}>
          <h3>
            {file.name} <span className="badge">{file.result.label}</span>
          </h3>
          <table>
            <thead>
              <tr>
                <th>In the file</th>
                <th className="num">Days</th>
                <th className="num">Net P&amp;L</th>
                <th className="num">Payouts</th>
                <th>Goes into</th>
              </tr>
            </thead>
            <tbody>
              {file.result.accounts.map((imported, index) => {
                const key = `${fileIndex}:${index}`;
                const total = sum(imported.days.map((day) => money(day.pnl)));
                return (
                  <tr key={key}>
                    <td>{imported.externalId ?? <span className="muted">no account named</span>}</td>
                    <td className="num mono">{imported.days.length}</td>
                    <td className={`num mono ${tone(total)}`}>{signed(total)}</td>
                    <td className="num mono">{imported.payouts.length}</td>
                    <td>
                      <select aria-label={`Account for ${imported.externalId ?? 'unnamed rows'}`} value={choice[key] ?? ''} onChange={(event) => setChoice({ ...choice, [key]: event.target.value })}>
                        <option value="">Skip</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {file.result.warnings.length > 0 && (
            <ul className="warnings">
              {file.result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {loaded.length > 0 && (
        <button type="button" className="primary" onClick={apply}>
          Apply import
        </button>
      )}
      {log.length > 0 && (
        <ul className="panel plain" data-testid="import-log">
          {log.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
