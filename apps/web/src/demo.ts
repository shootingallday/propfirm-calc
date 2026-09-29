import { addCalendarDays, addPayout, applyDays, CATALOG_VERSION, createAccount, FIRMS, isTradingDay, todayIso, type Account, type Stage } from 'propfirm-calc';

import type { Saved } from './store.ts';

function lastTradingDays(count: number): string[] {
  const dates: string[] = [];
  let cursor = todayIso();
  while (dates.length < count) {
    cursor = addCalendarDays(cursor, -1);
    if (isTradingDay(cursor)) dates.push(cursor);
  }
  return dates.reverse();
}

function make(id: string, label: string, planId: string, stage: Stage, pnl: number[], extras: { payout?: [number, number]; externalId?: string } = {}): Account {
  const firm = FIRMS.find((item) => planId.startsWith(`${item.id}/`));
  const plan = firm?.plans.find((item) => item.id === planId);
  if (!firm || !plan) throw new Error(`Demo plan ${planId} is missing from the catalog`);
  const dates = lastTradingDays(pnl.length);
  let account = createAccount({ id, label, firm, plan, stage, catalogVersion: CATALOG_VERSION });
  account = applyDays(account, pnl.map((value, index) => ({ date: dates[index]!, pnl: String(value), source: 'demo' }))).account;
  if (extras.payout) account = addPayout(account, dates[extras.payout[0]]!, extras.payout[1]);
  return extras.externalId ? { ...account, externalIds: [extras.externalId] } : account;
}

export function loadDemo(): Saved {
  return {
    version: 1,
    demo: true,
    avgDay: {},
    accounts: [
      make('demo-tpt', 'TPT 50K PRO', 'take-profit-trader/test/50000', 'funded', [420, -180, 610, 390, -240, 515, 280, -95, 640, 500], { externalId: 'TPT50K-1' }),
      make('demo-topstep', 'Topstep 50K Express', 'topstep/trading-combine/50000', 'funded', [380, 220, -150, 460, -310, 190, 410, -120, 260, 175], { payout: [4, 300], externalId: 'TS-EXP-4471' }),
      make('demo-mffu', 'MFFU Rapid 50K', 'my-funded-futures/rapid/50000', 'eval', [640, -210, 900, 380, -160, 520, 380]),
      make('demo-tradeify', 'Tradeify Growth 50K', 'tradeify/growth/50000', 'eval', [310, -240, 420, -1250, 180, -90, 260]),
      make('demo-lucid', 'Lucid Pro 50K', 'lucid-trading/lucidpro/50000', 'funded', [450, 220, -310, -880, -1120, -760], { externalId: 'LT-88214' }),
    ],
  };
}
