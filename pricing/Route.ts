import UniswapV2Pair from "./AMM.js";
import Token from "./Token.js";

class Route {
  // Represents a swap route through one or more pools.
  private readonly pools: UniswapV2Pair[];
  private readonly path: Token[];
  constructor(pools: UniswapV2Pair[], path: Token[]) {
    if (pools.length !== path.length - 1)
      throw new Error("Count of tokens must be pools + 1");
    this.pools = pools;
    this.path = path; // token_in → intermediate... → token_out
  }
  get hops(): number {
    return this.pools.length;
  }

  getOutput(amountIn: number): bigint {
    // Simulate full route, return final output.x
    for (let i = 0; i < this.hops - 1; i++) {
      amountIn =
        Number(this.pools[i].getAmountOut(amountIn, this.path[i])) /
        Number(this.path[i + 1].decimals);
    }
    const amountOut = this.pools[this.hops - 1].getAmountOut(
      amountIn,
      this.path[this.hops],
    );
    return amountOut;
  }

  getIntermediateAmounts(amountIn: number): bigint[] {
    //Return amount at each step: [input, after_hop1, after_hop2, ...]
    const amounts = [];
    amounts.push(BigInt(amountIn) * this.path[0].decimals);
    for (let i = 0; i < this.hops - 1; i++) {
      const amountOut = this.pools[i].getAmountOut(amountIn, this.path[i]);
      amounts.push(amountOut);
      amountIn = Number(amountOut) / Number(this.path[i + 1].decimals);
    }
    const amountOut = this.pools[this.hops - 1].getAmountOut(
      amountIn,
      this.path[this.hops],
    );
    amounts.push(amountOut);
    return amounts;
  }

  estimateGas(): bigint {
    // Estimate gas: ~150k base + ~100k per hop.
    const base = 150_000;
    const perHop = 100_000;
    return BigInt(base + (this.hops - 1) * perHop);
  }
}
export default Route;
