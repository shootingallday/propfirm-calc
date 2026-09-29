import lucidTrading from '../../catalog/lucid-trading.json' with { type: 'json' };
import myFundedFutures from '../../catalog/my-funded-futures.json' with { type: 'json' };
import takeProfitTrader from '../../catalog/take-profit-trader.json' with { type: 'json' };
import topstep from '../../catalog/topstep.json' with { type: 'json' };
import tradeify from '../../catalog/tradeify.json' with { type: 'json' };
import type { Firm, Plan, Stage, StageRules } from './types.ts';

export type * from './types.ts';

export const FIRMS: Firm[] = [topstep, tradeify, lucidTrading, myFundedFutures, takeProfitTrader] as Firm[];

export const CATALOG_VERSION: string = FIRMS.map((firm) => firm.checkedAt).reduce((a, b) => (a > b ? a : b));

const PLANS = new Map<string, Plan>(FIRMS.flatMap((firm) => firm.plans.map((plan) => [plan.id, plan] as const)));

export function findPlan(planId: string): Plan | undefined {
  return PLANS.get(planId);
}

export function findStage(planId: string, stage: Stage): StageRules | undefined {
  return findPlan(planId)?.stages.find((s) => s.stage === stage);
}
