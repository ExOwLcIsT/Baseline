import { Contract } from "ethers";
import ChainClient from "../chain/ChainClient.js";
import { Address } from "../core/BaseTypes/Address.js";
import UniswapV2Pair from "./AMM.js";
import Token from "./Token.js";

class PriceImpactAnalyzer {
  /*
    Analyzes price impact across different trade sizes.
    */
  pair: UniswapV2Pair;
  constructor(pair: UniswapV2Pair) {
    this.pair = pair;
  }

  generateImpactTable(
    token_in: string,
    sizes: Array<bigint>,
  ): Array<Record<string, any>> {
    /*
        Returns list of:
        {
            'amount_in': int,
            'amount_out': int,
            'spot_price': Decimal,
            'execution_price': Decimal,
            'price_impact_pct': Decimal,
        }
    */
    const rows: any[] = [];
    const tokenIn =
      token_in === this.pair.token0.name ? this.pair.token0 : this.pair.token1;
    const spot = this.pair.getSpotPrice(tokenIn);

    for (const amountIn of sizes) {
      const amountOut = this.pair.getAmountOut(amountIn, tokenIn);
      const executionPrice = this.pair.getExecutionPrice(amountIn, tokenIn);
      const impactPct = this.pair.getPriceImpact(amountIn, tokenIn);

      rows.push({
        amountIn: amountIn / tokenIn.decimals,
        amountOut: amountOut,
        spotPrice: spot,
        executionPrice: executionPrice,
        priceImpactPct: impactPct,
      });
    }

    return rows;
  }

  findMaxSizeForImpact(tokenIn: Token, maxImpactPct: number): bigint {
    /*
      Binary search to find largest trade with impact <= max_impact_pct.
      */
    const maxValue = this.pair.token0.equals(tokenIn)
      ? this.pair.reserve0
      : this.pair.reserve1;
    return this.findMaxSizeForImpactRecursion(
      tokenIn,
      maxImpactPct,
      0n,
      maxValue,
    );
  }
  findMaxSizeForImpactRecursion(
    tokenIn: Token,
    maxImpactPct: number,
    min: bigint,
    max: bigint,
  ): bigint {
    const value = (max + min) / 2n;
    const priceImpact = this.pair.getPriceImpact(value, tokenIn);

    if (max === min) return value;
    if (priceImpact > maxImpactPct)
      return this.findMaxSizeForImpactRecursion(
        tokenIn,
        maxImpactPct,
        min,
        value,
      );
    if (priceImpact < maxImpactPct) {
      return this.findMaxSizeForImpactRecursion(
        tokenIn,
        maxImpactPct,
        value,
        max,
      );
    }
    return value;
  }
  estimateTrueCost(
    amountIn: bigint,
    tokenIn: Token,
    gasPriceGwei: number,
    gasEstimate: number = 150_000,
  ) {
    const tokenOut = tokenIn.equals(this.pair.token0)
      ? this.pair.token1
      : this.pair.token0;

    // Calculate gross output from swap
    const grossOutRaw: bigint = this.pair.getAmountOut(amountIn, tokenIn);

    // Gas cost in ETH
    const gasCostEth: number = (gasEstimate * gasPriceGwei) / 1e9;

    // Convert gas cost to output token units via spot price
    const spotPrice: number = this.pair.getSpotPrice(tokenIn); // tokenIn/tokenOut
    let gasCostInOutputToken: number;

    if (tokenOut.name === "ETH") {
      gasCostInOutputToken = gasCostEth;
    } else if (tokenIn.name === "ETH") {
      // Swap input ETH → output token
      gasCostInOutputToken = gasCostEth * spotPrice;
    } else {
      // Neither token is ETH, approximate via ETH as intermediate
      gasCostInOutputToken = gasCostEth * spotPrice; // rough estimate
    }

    const netOutput =
      Number(grossOutRaw) / Number(tokenOut.decimals) - gasCostInOutputToken;

    const effectivePrice = Number(amountIn) / netOutput;

    return {
      grossOutput: grossOutRaw,
      gasCostEth,
      gasCostInOutputToken,
      netOutput,
      effectivePrice,
    };
  }
}

export default PriceImpactAnalyzer;
