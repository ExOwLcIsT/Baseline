import { Decimal } from "decimal.js";
import Signal from "./Signal.js";
class ScorerConfig {
  spreadWeight: number = 0.4;
  liquidityWeight: number = 0.2;
  inventoryWeight: number = 0.2;
  historyWeight: number = 0.2;
  excellentSpreadBps: number = 100;
  minSpreadBps: number = 30;
}
export default class SignalScorer {
  config: ScorerConfig;
  recentResults: [string, boolean][];
  constructor(config: ScorerConfig | undefined = undefined) {
    this.config = config ?? new ScorerConfig();
    this.recentResults = [];
  }

  score(
    signal: Signal,
    inventoryState: { asset: string; status: boolean }[],
  ): number {
    const scores: { [id: string]: number } = {
      spread: this.scoreSpread(signal.spreadBps),
      liquidity: this.scoreLiquidity(signal.spreadBps),

      inventory: this.scoreInventory(signal, inventoryState),
      history: this.scoreHistory(signal.pair),
    };
    const weighted = Object.keys(scores).reduce((sum, k) => {
      return (
        sum +
        scores[k] * Number(this.config[`${k}Weight` as keyof ScorerConfig])
      );
    }, 0);
    return Math.round(Math.max(0, Math.min(100, weighted)) * 10) / 10;
  }
  scoreLiquidity(spreadBps: Decimal): number {
    const slippage = spreadBps.mul(0.1);
    if (slippage.lt(5)) return 100;
    else if (slippage.gt(20)) return 0;
    return 100 - slippage.sub(5).toNumber() * (100 / 15);
  }

  scoreSpread(spreadBps: Decimal): number {
    if (spreadBps.lte(this.config.minSpreadBps)) return 0;
    if (spreadBps.gte(this.config.excellentSpreadBps)) return 100;
    const rangeBps = this.config.excellentSpreadBps - this.config.minSpreadBps;
    return spreadBps
      .sub(this.config.minSpreadBps)
      .div(rangeBps)
      .mul(100)
      .toNumber();
  }

  scoreInventory(
    signal: Signal,
    skews: { asset: string; status: boolean }[],
  ): number {
    const base = signal.pair.split("/")[0];
    const relevant = skews.filter((s) => s.asset == base);
    if (relevant.some((s) => s.status === true)) return 20; // Assets that need rebalancing exist
    return 60;
  }
  scoreHistory(pair: string): number {
    // const results = [r for p, r in this.recentResults[-20:] if p == pair]

    const results = this.recentResults
      .slice(-20)
      .filter((p) => p[0] == pair)
      .map((pair) => pair[1]);
    if (results.length < 3) return 50;
    return (
      (results.reduce((count, r) => (r ? ++count : count), 0) /
        results.length) *
      100
    );
  }
  recordResult(pair: string, success: boolean) {
    this.recentResults.push([pair, success]);
    this.recentResults = this.recentResults.slice(-100);
  }
  applyDecay(signal: Signal): number {
    const age = signal.ageSeconds();
    const ttl = signal.expiry - signal.timestamp;
    const decayFactor = Math.max(0, 1 - (age / ttl) * 0.5);
    return signal.score * decayFactor;
  }
}
