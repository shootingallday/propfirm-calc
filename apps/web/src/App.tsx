import { useEffect, useState } from 'react';
import { CATALOG_VERSION } from 'propfirm-calc';

import { AddAccount } from './components/AddAccount.tsx';
import { Accounts } from './components/Accounts.tsx';
import { Calendar } from './components/Calendar.tsx';
import { Import } from './components/Import.tsx';
import { Tools } from './components/Tools.tsx';
import { shortDate } from './format.ts';
import { switchTheme } from './px/theme-switch.js';
import { useSaved } from './store.ts';
import { Icon } from './ui.tsx';

const TABS = [
  ['accounts', 'Accounts', 'account'],
  ['calendar', 'Calendar', 'calendar'],
  ['import', 'Import', 'import'],
  ['tools', 'Tools', 'settings'],
] as const;

function readRoute(): [string, string | undefined] {
  const [page = 'accounts', id] = location.hash.slice(1).split('/');
  return [page || 'accounts', id];
}

export function App() {
  const store = useSaved();
  const [[page, id], setRoute] = useState(readRoute);
  const [adding, setAdding] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      if (!location.hash.startsWith('#account/')) scrollTo(0, 0);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const tab = page === 'account' ? 'accounts' : TABS.some(([key]) => key === page) ? page : 'accounts';
  useEffect(() => {
    document.title = `${TABS.find(([key]) => key === tab)?.[1]} · propfirm-calc`;
  }, [tab]);

  const nav = TABS.map(([key, label, icon]) => (
    <a key={key} href={`#${key}`} aria-current={tab === key ? 'page' : undefined}>
      <Icon name={icon} />
      {label}
    </a>
  ));
  const add = () => setAdding(true);

  return (
    <>
      <a
        className="px-skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="bar">
        <a className="wordmark" href="#accounts">
          <img src="/icon.png" alt="" />
          propfirm-calc
        </a>
        <nav className="px-nav" aria-label="Primary">
          {nav}
        </nav>
        <div className="bar-end">
          <button
            type="button"
            className="px-btn"
            data-variant="ghost"
            data-size="icon"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={(event) => {
              switchTheme(!dark, document.documentElement, { from: event.currentTarget });
              setDark(!dark);
            }}
          >
            <Icon name={dark ? 'light' : 'dark'} />
          </button>
          <button type="button" className="px-btn add-top" data-variant="primary" onClick={add}>
            <Icon name="add" />
            Add account
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {tab === 'accounts' && <Accounts store={store} openId={page === 'account' ? (id ?? null) : null} onAdd={add} />}
        {tab === 'calendar' && <Calendar store={store} onAdd={add} />}
        {tab === 'import' && <Import store={store} onAdd={add} />}
        {tab === 'tools' && <Tools store={store} />}
      </main>
      <footer className="foot">
        <span>Firm rules checked up to {shortDate(CATALOG_VERSION)}, {CATALOG_VERSION.slice(0, 4)}</span>
        <span>Your data stays in this browser</span>
        <a href="https://github.com/shootingallday/propfirm-calc">GitHub</a>
      </footer>
      <nav className="tabbar" aria-label="Primary">
        {nav}
      </nav>
      <button type="button" className="px-btn fab" data-variant="primary" data-size="lg" onClick={add}>
        <Icon name="add" />
        Add account
      </button>
      {adding && (
        <AddAccount
          store={store}
          onClose={(newId) => {
            setAdding(false);
            if (newId && tab !== 'import') location.hash = `account/${newId}`;
          }}
        />
      )}
    </>
  );
}
