import { applyImport, CATALOG_VERSION, createAccount, FIRMS, importCsv, type Account, type Stage } from 'propfirm-calc';

import cashHistory from '../../../packages/core/samples/tradovate-cash-history.csv?raw';
import tradovateFills from '../../../packages/core/samples/tradovate-fills.csv?raw';
import topstepxTrades from '../../../packages/core/samples/topstepx-trades.csv?raw';
import type { Saved } from './store.ts';

function make(id: string, label: string, planId: string, stage: Stage): Account {
  const firm = FIRMS.find((item) => planId.startsWith(`${item.id}/`));
  const plan = firm?.plans.find((item) => item.id === planId);
  if (!firm || !plan) throw new Error(`Demo plan ${planId} is missing from the catalog`);
  return createAccount({ id, label, firm, plan, stage, catalogVersion: CATALOG_VERSION });
}

function fill(account: Account, csv: string, externalId: string | null): Account {
  const result = importCsv(csv);
  const imported = result.accounts.find((item) => item.externalId === externalId);
  return imported ? applyImport(account, imported, result.layout).account : account;
}

export function loadDemo(): Saved {
  let tpt = make('demo-tpt', 'TPT 50K PRO', 'take-profit-trader/test/50000', 'funded');
  tpt = fill(tpt, tradovateFills, 'TPT50K-1');
  let mffu = make('demo-mffu', 'MFFU Rapid 50K', 'my-funded-futures/rapid/50000', 'funded');
  mffu = fill(fill(mffu, tradovateFills, 'MFFU50K-2'), cashHistory, 'MFFU50K-2');
  let topstep = make('demo-topstep', 'Topstep 50K Combine', 'topstep/trading-combine/50000', 'eval');
  topstep = fill(topstep, topstepxTrades, null);
  return { version: 1, accounts: [tpt, mffu, topstep], avgDay: {} };
}
