import { cushion, type DrawdownType } from './drawdown.ts';
import { money, type Money, type MoneyInput } from './money.ts';

function checkTickValue(tickValue: MoneyInput): void {
  if (money(tickValue).lte(0)) throw new RangeError('tickValue must be a positive dollar amount');
}

function checkStopTicks(stopTicks: MoneyInput): void {
  if (money(stopTicks).lte(0)) throw new RangeError('stopTicks must be a positive number of ticks');
}

export function pnl(ticks: MoneyInput, tickValue: MoneyInput, contracts = 1): Money {
  checkTickValue(tickValue);
  if (contracts < 0) throw new RangeError('contracts must not be negative');
  return money(ticks).times(tickValue).times(contracts);
}

export function ticksToTarget(targetPnl: MoneyInput, tickValue: MoneyInput, contracts = 1): Money {
  checkTickValue(tickValue);
  if (contracts <= 0) throw new RangeError('contracts must be positive');
  return money(targetPnl).div(money(tickValue).times(contracts));
}

export function positionRisk(stopTicks: MoneyInput, tickValue: MoneyInput, contracts = 1): Money {
  checkTickValue(tickValue);
  checkStopTicks(stopTicks);
  if (contracts < 0) throw new RangeError('contracts must not be negative');
  return money(stopTicks).times(tickValue).times(contracts);
}

export function maxContracts(riskBudget: MoneyInput, stopTicks: MoneyInput, tickValue: MoneyInput): number {
  checkTickValue(tickValue);
  checkStopTicks(stopTicks);
  const budget = money(riskBudget);
  if (budget.lte(0)) return 0;
  return budget.div(money(stopTicks).times(tickValue)).floor().toNumber();
}

export type CushionSizing = {
  currentEquity: MoneyInput;
  startingBalance: MoneyInput;
  maxDrawdown: MoneyInput;
  peakEquity: MoneyInput;
  stopTicks: MoneyInput;
  tickValue: MoneyInput;
  riskPct?: number;
  ddType?: DrawdownType;
  lockAt?: MoneyInput;
};

export function maxContractsFromCushion(input: CushionSizing): number {
  const riskPct = input.riskPct ?? 100;
  if (!(riskPct > 0 && riskPct <= 100)) throw new RangeError('riskPct must be greater than 0 and at most 100');
  const room = cushion(
    input.currentEquity,
    input.startingBalance,
    input.maxDrawdown,
    input.peakEquity,
    input.ddType ?? 'trailing',
    input.lockAt,
  );
  return maxContracts(room.times(riskPct).div(100), input.stopTicks, input.tickValue);
}

export function rMultiple(realizedPnl: MoneyInput, risk: MoneyInput): Money {
  if (money(risk).lte(0)) throw new RangeError('risk must be a positive dollar amount');
  return money(realizedPnl).div(risk);
}
