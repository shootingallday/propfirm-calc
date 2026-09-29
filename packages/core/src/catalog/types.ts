export type Stage = 'eval' | 'funded' | 'live';

export type Source = {
  url: string;
  checkedAt: string;
  pxKey?: string;
};

export type DrawdownRule = {
  amount: string;
  mode: 'intraday_trailing' | 'eod_trailing' | 'static';
  lockAt: 'start' | 'never' | { aboveStart: string };
  afterFirstPayout?: { floorAboveStart: string };
};

export type DailyLossRule = {
  amount: string;
  effect: 'breach' | 'session_lock';
};

export type ConsistencyRule = {
  pct: string;
  basis: 'total_profit' | 'profit_since_payout' | 'profit_target';
  effect: 'raises_target' | 'blocks_payout';
  bestDay?: 'resets' | 'carries';
};

export type PayoutBuffer = {
  kind: 'balance_to_request' | 'balance_retained';
  amount: string;
  firstPayoutOnly?: boolean;
};

export type PayoutPath = {
  name: string;
  winningDays?: { count: number; minProfit: string };
  minTradingDays?: number;
  minProfit?: string;
  consistency?: ConsistencyRule;
  buffer?: PayoutBuffer;
  minRequest?: string;
  cap?: string;
  capPctOfProfit?: number;
  calendarDaysAfterFirstTrade?: number;
  maxPayouts?: number;
  closesAtBalance?: string;
  split: number;
  notes?: string;
  pxKey?: string;
};

export type StageRules = {
  stage: Stage;
  name: string;
  profitTarget?: string;
  minTradingDays?: number;
  drawdown: DrawdownRule;
  dailyLoss?: DailyLossRule;
  consistency?: ConsistencyRule;
  contracts?: { minis?: number; micros?: number };
  payoutPaths?: PayoutPath[];
  source: Source;
  notes?: string;
};

export type Plan = {
  id: string;
  firm: string;
  program: string;
  size: number;
  stages: StageRules[];
};

export type Firm = {
  id: string;
  name: string;
  website: string;
  rulesUrl: string;
  checkedAt: string;
  plans: Plan[];
};
