import { useState } from 'react';
import { CATALOG_VERSION } from 'propfirm-calc';

import { Accounts } from './components/Accounts.tsx';
import { Calendar } from './components/Calendar.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { Import } from './components/Import.tsx';
import { loadDemo } from './demo.ts';
import { useSaved } from './store.ts';

const TABS = ['Dashboard', 'Accounts', 'Import', 'Calendar'] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const store = useSaved();
  const [tab, setTab] = useState<Tab>('Dashboard');
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <img src="/icon.png" alt="" width={28} height={28} />
          <strong>propfirm-calc</strong>
        </div>
        <nav aria-label="Sections">
          {TABS.map((name) => (
            <button key={name} type="button" className={tab === name ? 'active' : ''} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}>
              {name}
            </button>
          ))}
        </nav>
        {store.saved.accounts.length === 0 && (
          <button type="button" className="link" onClick={() => store.setSaved(loadDemo())}>
            Load demo accounts
          </button>
        )}
      </header>
      <main>
        {tab === 'Dashboard' && <Dashboard store={store} onAdd={() => setTab('Accounts')} />}
        {tab === 'Accounts' && <Accounts store={store} selected={selected} onSelect={setSelected} />}
        {tab === 'Import' && <Import store={store} />}
        {tab === 'Calendar' && <Calendar store={store} />}
      </main>
      <footer className="muted small">
        Firm rules checked up to {CATALOG_VERSION}. Rules change often; every account links to its source. Your data stays in this browser. Open source on{' '}
        <a href="https://github.com/shootingallday/propfirm-calc" target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </footer>
    </div>
  );
}
