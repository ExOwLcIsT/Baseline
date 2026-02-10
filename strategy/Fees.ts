import { Decimal } from "decimal.js";

export default class FeeStructure {
  cexTakerBps: Decimal = Decimal(10.0);
  dexSwapBps: Decimal = Decimal(30.0);
  gasCostUsd: Decimal = Decimal(5.0);

  totalFeeBps(tradeValueUsd: Decimal): Decimal {
    const gasBps = this.gasCostUsd.div(tradeValueUsd).mul(10_000);
    return this.cexTakerBps.add(this.dexSwapBps).add(gasBps);
  }
  breakevenSpreadBps(tradeValueUsd: Decimal): Decimal {
    return this.totalFeeBps(tradeValueUsd);
  }
  netProfitUsd(spreadBps: Decimal, tradeValueUsd: Decimal): Decimal {
    const gross = spreadBps.div(10_000).mul(tradeValueUsd);
    const fees = this.totalFeeBps(tradeValueUsd).div(10_000).mul(tradeValueUsd);
    return gross.sub(fees);
  }
}
