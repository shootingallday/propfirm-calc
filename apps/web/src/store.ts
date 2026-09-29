import { useEffect, useState } from 'react';
import { evaluate, type Account } from 'propfirm-calc';

import { loadDemo } from './demo.ts';

const KEY = 'propfirm-calc:v1';

export type Saved = {
  version: 1;
  accounts: Account[];
  avgDay: Record<string, string>;
  demo?: boolean;
};

export const EMPTY: Saved = { version: 1, accounts: [], avgDay: {} };

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return loadDemo();
    const parsed = parseSaved(raw);
    return { ...parsed, demo: (JSON.parse(raw) as Saved).demo };
  } catch {
    const raw = localStorage.getItem(KEY);
    if (raw) localStorage.setItem(`${KEY}:unreadable`, raw);
    return EMPTY;
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkAccount(value: unknown): Account {
  const account = value as Account;
  const ok =
    typeof account === 'object' &&
    account !== null &&
    typeof account.id === 'string' &&
    typeof account.label === 'string' &&
    typeof account.planId === 'string' &&
    typeof account.rules === 'object' &&
    Array.isArray(account.days) &&
    Array.isArray(account.payouts) &&
    Array.isArray(account.externalIds) &&
    account.days.every((day) => DATE.test(day?.date) && typeof day.pnl === 'string') &&
    account.payouts.every((payout) => DATE.test(payout?.date) && typeof payout.amount === 'string');
  if (!ok) throw new Error('This file has an account the app can’t read.');
  evaluate(account);
  return { ...account, included: account.included !== false };
}

export function parseSaved(text: string): Saved {
  const parsed = JSON.parse(text) as Partial<Saved>;
  if (parsed.version !== 1 || !Array.isArray(parsed.accounts)) throw new Error('This file is not a propfirm-calc export.');
  const avgDay = Object.fromEntries(Object.entries(parsed.avgDay ?? {}).filter(([, value]) => typeof value === 'string'));
  try {
    return { version: 1, accounts: parsed.accounts.map(checkAccount), avgDay };
  } catch {
    throw new Error('This file has an account the app can’t read, so nothing was loaded.');
  }
}

export function useSaved() {
  const [saved, setSaved] = useState<Saved>(load);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(saved));
  }, [saved]);
  return {
    saved,
    setSaved,
    updateAccount(id: string, update: (account: Account) => Account) {
      setSaved((current) => ({
        ...current,
        accounts: current.accounts.map((account) => (account.id === id ? update(account) : account)),
      }));
    },
    addAccounts(accounts: Account[]) {
      setSaved((current) => ({ ...current, accounts: [...current.accounts, ...accounts] }));
    },
    removeAccount(id: string) {
      setSaved((current) => ({ ...current, accounts: current.accounts.filter((account) => account.id !== id) }));
    },
    setAvgDay(id: string, value: string) {
      setSaved((current) => ({ ...current, avgDay: { ...current.avgDay, [id]: value } }));
    },
  };
}

export type Store = ReturnType<typeof useSaved>;

export function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}
