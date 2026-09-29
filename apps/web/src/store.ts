import { useEffect, useState } from 'react';
import type { Account } from 'propfirm-calc';

const KEY = 'propfirm-calc:v1';

export type Saved = {
  version: 1;
  accounts: Account[];
  avgDay: Record<string, string>;
};

const EMPTY: Saved = { version: 1, accounts: [], avgDay: {} };

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Saved;
    return parsed.version === 1 && Array.isArray(parsed.accounts) ? { ...EMPTY, ...parsed } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function parseSaved(text: string): Saved {
  const parsed = JSON.parse(text) as Partial<Saved>;
  if (parsed.version !== 1 || !Array.isArray(parsed.accounts)) throw new Error('This file is not a propfirm-calc export.');
  return { version: 1, accounts: parsed.accounts, avgDay: parsed.avgDay ?? {} };
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
