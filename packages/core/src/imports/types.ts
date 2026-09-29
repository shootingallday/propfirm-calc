export type LayoutId =
  | 'tradovate-fills'
  | 'tradovate-performance'
  | 'tradovate-balance-history'
  | 'tradovate-cash-history'
  | 'topstepx-orders'
  | 'topstepx-trades';

export type ImportedDay = {
  date: string;
  pnl: string;
  sidesWithoutFees: number;
  low?: string;
};

export type ImportedPayout = {
  date: string;
  amount: string;
};

export type ImportedAccount = {
  externalId: string | null;
  days: ImportedDay[];
  payouts: ImportedPayout[];
};

export type ImportResult = {
  layout: LayoutId;
  label: string;
  accounts: ImportedAccount[];
  warnings: string[];
};

export class ImportError extends Error {
  override name = 'ImportError';
}
