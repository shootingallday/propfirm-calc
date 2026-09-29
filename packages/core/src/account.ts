import type { Firm, Plan, Stage, StageRules } from './catalog/types.ts';
import type { ImportedAccount, LayoutId } from './imports/types.ts';
import { money, type Money, type MoneyInput } from './money.ts';

export type DayEntry = {
  date: string;
  pnl: string;
  source: string;
  sidesWithoutFees?: number;
};

export type PayoutEntry = {
  date: string;
  amount: string;
  source: string;
};

export type Account = {
  id: string;
  label: string;
  firmId: string;
  planId: string;
  stage: Stage;
  rules: StageRules;
  catalogVersion: string;
  startingBalance: string;
  feePerSide: string;
  days: DayEntry[];
  payouts: PayoutEntry[];
  externalIds: string[];
  included: boolean;
};

export type NewAccount = {
  id: string;
  label: string;
  firm: Firm;
  plan: Plan;
  stage: Stage;
  catalogVersion: string;
  feePerSide?: MoneyInput;
};

export function createAccount(input: NewAccount): Account {
  const rules = input.plan.stages.find((stage) => stage.stage === input.stage);
  if (!rules) throw new RangeError(`${input.plan.id} has no ${input.stage} stage`);
  return {
    id: input.id,
    label: input.label,
    firmId: input.firm.id,
    planId: input.plan.id,
    stage: input.stage,
    rules: structuredClone(rules),
    catalogVersion: input.catalogVersion,
    startingBalance: String(input.plan.size),
    feePerSide: money(input.feePerSide ?? 0).toString(),
    days: [],
    payouts: [],
    externalIds: [],
    included: true,
  };
}

export function netPnl(day: DayEntry, feePerSide: MoneyInput): Money {
  return money(day.pnl).minus(money(feePerSide).times(day.sidesWithoutFees ?? 0));
}

export type Applied = {
  account: Account;
  replaced: string[];
  added: string[];
  payoutsAdded: number;
};

export function applyDays(account: Account, days: readonly DayEntry[]): Applied {
  const incoming = new Map(days.map((day) => [day.date, day]));
  const replaced = account.days.filter((day) => incoming.has(day.date)).map((day) => day.date);
  const kept = account.days.filter((day) => !incoming.has(day.date));
  const merged = [...kept, ...incoming.values()].sort((a, b) => a.date.localeCompare(b.date));
  const added = [...incoming.keys()].filter((date) => !replaced.includes(date)).sort();
  return { account: { ...account, days: merged }, replaced: replaced.sort(), added, payoutsAdded: 0 };
}

export function applyImport(account: Account, imported: ImportedAccount, layout: LayoutId): Applied {
  const source = `import:${layout}`;
  const result = applyDays(
    account,
    imported.days.map((day) => ({ date: day.date, pnl: day.pnl, source, sidesWithoutFees: day.sidesWithoutFees })),
  );
  const known = new Set(result.account.payouts.map((payout) => `${payout.date}|${money(payout.amount).toString()}`));
  const fresh = imported.payouts
    .filter((payout) => !known.has(`${payout.date}|${money(payout.amount).toString()}`))
    .map((payout) => ({ date: payout.date, amount: payout.amount, source }));
  const payouts = [...result.account.payouts, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
  const externalIds =
    imported.externalId && !account.externalIds.includes(imported.externalId)
      ? [...account.externalIds, imported.externalId]
      : account.externalIds;
  return { ...result, account: { ...result.account, payouts, externalIds }, payoutsAdded: fresh.length };
}

export function setDay(account: Account, date: string, pnl: MoneyInput): Applied {
  return applyDays(account, [{ date, pnl: money(pnl).toString(), source: 'manual' }]);
}

export function removeDay(account: Account, date: string): Account {
  return { ...account, days: account.days.filter((day) => day.date !== date) };
}

export function addPayout(account: Account, date: string, amount: MoneyInput): Account {
  const payouts = [...account.payouts, { date, amount: money(amount).toString(), source: 'manual' }];
  return { ...account, payouts: payouts.sort((a, b) => a.date.localeCompare(b.date)) };
}

export function removePayout(account: Account, index: number): Account {
  return { ...account, payouts: account.payouts.filter((_, at) => at !== index) };
}

export function matchImportedAccount(accounts: readonly Account[], externalId: string | null): Account | undefined {
  if (externalId === null) return undefined;
  return accounts.find((account) => account.externalIds.includes(externalId));
}
