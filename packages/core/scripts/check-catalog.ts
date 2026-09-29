import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIRMS } from '../src/catalog/index.ts';
import type { PayoutPath, StageRules } from '../src/catalog/types.ts';

type PxRule = { key: string; category: string; parameters: Record<string, string | undefined> };
type PxRecord = { planStages: { key: string }[]; stageRules: PxRule[] };

const pxRoot = process.argv[2] ?? '/Users/jomar/PX Projects/PX Journals';
const bootstrap = join(pxRoot, 'docs/research/catalog-bootstrap');
const snapshot = readdirSync(bootstrap)
  .filter((dir) => existsSync(join(bootstrap, dir, 'official/firms')))
  .sort()
  .at(-1);
if (!snapshot) {
  console.error(`No official firm records under ${bootstrap}`);
  process.exit(1);
}
const firmsDir = join(bootstrap, snapshot, 'official/firms');

const records = new Map<string, PxRecord>();
function record(slug: string): PxRecord {
  let found = records.get(slug);
  if (!found) {
    found = JSON.parse(readFileSync(join(firmsDir, `${slug}.json`), 'utf8')) as PxRecord;
    records.set(slug, found);
  }
  return found;
}

type Field = 'profit target' | 'drawdown' | 'daily loss' | 'consistency pct' | 'minimum trading days' | 'winning days count' | 'winning day threshold';

function pxValues(rules: PxRule[], field: Field): string[] {
  const pick = (category: string, ...names: string[]) =>
    rules
      .filter((r) => r.category === category)
      .map((r) => names.map((n) => r.parameters[n]).find((v) => v !== undefined))
      .filter((v): v is string => v !== undefined);
  switch (field) {
    case 'profit target':
      return pick('profit_target', 'amount');
    case 'drawdown':
      return pick('maximum_drawdown', 'amount');
    case 'daily loss':
      return pick('daily_loss', 'amount');
    case 'consistency pct':
      return pick('consistency', 'percentage');
    case 'minimum trading days':
      return pick('minimum_trading_days', 'count').filter((v) => Number(v) > 0);
    case 'winning days count':
      return pick('winning_days', 'count');
    case 'winning day threshold':
      return pick('winning_days', 'amount', 'threshold');
  }
}

const STAGE_FIELDS: Field[] = ['profit target', 'drawdown', 'daily loss'];
const PATH_FIELDS: Field[] = ['consistency pct', 'minimum trading days', 'winning days count', 'winning day threshold'];

function stageValues(stage: StageRules, field: Field): string[] {
  const values: Partial<Record<Field, string>> = {
    'profit target': stage.profitTarget,
    drawdown: stage.drawdown.amount,
    'daily loss': stage.dailyLoss?.amount,
    'consistency pct': stage.consistency?.pct,
    'minimum trading days': stage.minTradingDays?.toString(),
  };
  const v = values[field];
  return v === undefined ? [] : [v];
}

function pathValues(path: PayoutPath, field: Field): string[] {
  const values: Partial<Record<Field, string>> = {
    'consistency pct': path.consistency?.pct,
    'minimum trading days': path.minTradingDays?.toString(),
    'winning days count': path.winningDays?.count.toString(),
    'winning day threshold': path.winningDays?.minProfit,
  };
  const v = values[field];
  return v === undefined ? [] : [v];
}

const norm = (values: string[]) => [...new Set(values.map((v) => String(Number(v))))].sort();
const drift: string[] = [];
let checked = 0;

function compare(where: string, pxKey: string, fields: Field[], ours: (field: Field) => string[]) {
  const slug = pxKey.split('/')[0]!;
  const px = record(slug);
  if (!px.planStages.some((s) => s.key === pxKey)) {
    drift.push(`${where}: pxKey ${pxKey} no longer exists in PX`);
    return;
  }
  const rules = px.stageRules.filter((r) => r.key.startsWith(`${pxKey}/rules/`));
  for (const field of fields) {
    const a = norm(ours(field));
    const b = norm(pxValues(rules, field));
    checked++;
    if (a.join(',') !== b.join(',')) {
      drift.push(`${where}: ${field} is ${a.join(', ') || 'absent'} here but ${b.join(', ') || 'absent'} in PX (${pxKey})`);
    }
  }
}

for (const firm of FIRMS) {
  for (const plan of firm.plans) {
    for (const stage of plan.stages) {
      const key = stage.source.pxKey;
      if (!key) continue;
      const where = `${plan.id} ${stage.stage}`;
      const shared = (stage.payoutPaths ?? []).filter((p) => !p.pxKey);
      compare(where, key, [...STAGE_FIELDS, ...PATH_FIELDS], (field) => [
        ...stageValues(stage, field),
        ...shared.flatMap((p) => pathValues(p, field)),
      ]);
      for (const path of stage.payoutPaths ?? []) {
        if (path.pxKey) compare(`${where} "${path.name}" path`, path.pxKey, PATH_FIELDS, (field) => pathValues(path, field));
      }
    }
  }
}

console.log(`PX snapshot ${snapshot} at ${firmsDir}`);
if (drift.length) {
  console.log(`${drift.length} drift finding(s) across ${checked} checks:`);
  for (const line of drift) console.log(`  ${line}`);
  process.exit(1);
}
console.log(`No drift: ${checked} checks across ${FIRMS.reduce((n, f) => n + f.plans.length, 0)} plans match PX.`);
