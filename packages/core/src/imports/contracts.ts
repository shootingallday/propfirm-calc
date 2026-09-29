import { money, type Money } from '../money.ts';
import { RowProblem } from './csv.ts';

const POINT_VALUES: Record<string, string> = {
  ES: '50',
  MES: '5',
  NQ: '20',
  MNQ: '2',
  YM: '5',
  MYM: '0.5',
  RTY: '50',
  M2K: '5',
  CL: '1000',
  MCL: '100',
  NG: '10000',
  MNG: '1000',
  RB: '42000',
  HO: '42000',
  GC: '100',
  MGC: '10',
  SI: '5000',
  SIL: '1000',
  HG: '25000',
  MHG: '2500',
  PL: '50',
  ZT: '2000',
  ZF: '1000',
  ZN: '1000',
  TN: '1000',
  ZB: '1000',
  UB: '1000',
  '6E': '125000',
  '6J': '12500000',
  '6B': '62500',
  '6A': '100000',
  '6C': '100000',
  '6S': '125000',
  M6E: '12500',
  M6A: '10000',
  M6B: '6250',
  ZC: '50',
  ZS: '50',
  ZW: '50',
  ZL: '600',
  ZM: '100',
  HE: '400',
  LE: '400',
  MBT: '0.1',
  MET: '0.1',
};

const MONTH_YEAR = /[FGHJKMNQUVXZ]\d{1,2}$/;

export function pointValue(symbol: string): Money {
  const cleaned = symbol.trim().toUpperCase();
  for (const candidate of [cleaned, cleaned.replace(MONTH_YEAR, '')]) {
    const value = POINT_VALUES[candidate];
    if (value) return money(value);
  }
  throw new RowProblem(
    `the symbol "${symbol}" is not a contract propfirm-calc knows, so its point value and P&L cannot be worked out`,
  );
}
