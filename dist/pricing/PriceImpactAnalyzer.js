class PriceImpactAnalyzer {
    /*
      Analyzes price impact across different trade sizes.
      */
    pair;
    constructor(pair) {
        this.pair = pair;
    }
    generateImpactTable(token_in, sizes) {
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
        const rows = [];
        const tokenIn = token_in === this.pair.token0.name ? this.pair.token0 : this.pair.token1;
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
    findMaxSizeForImpact(tokenIn, maxImpactPct) {
        /*
          Binary search to find largest trade with impact <= max_impact_pct.
          */
        const maxValue = this.pair.token0.equals(tokenIn)
            ? this.pair.reserve0
            : this.pair.reserve1;
        return this.findMaxSizeForImpactRecursion(tokenIn, maxImpactPct, 0n, maxValue);
    }
    findMaxSizeForImpactRecursion(tokenIn, maxImpactPct, min, max) {
        const value = (max + min) / 2n;
        const priceImpact = this.pair.getPriceImpact(value, tokenIn);
        if (max === min)
            return value;
        if (priceImpact > maxImpactPct)
            return this.findMaxSizeForImpactRecursion(tokenIn, maxImpactPct, min, value);
        if (priceImpact < maxImpactPct) {
            return this.findMaxSizeForImpactRecursion(tokenIn, maxImpactPct, value, max);
        }
        return value;
    }
    estimateTrueCost(amountIn, tokenIn, gasPriceGwei, gasEstimate = 150_000) {
        const tokenOut = tokenIn.equals(this.pair.token0)
            ? this.pair.token1
            : this.pair.token0;
        // Calculate gross output from swap
        const grossOutRaw = this.pair.getAmountOut(amountIn, tokenIn);
        // Gas cost in ETH
        const gasCostEth = (gasEstimate * gasPriceGwei) / 1e9;
        // Convert gas cost to output token units via spot price
        const spotPrice = this.pair.getSpotPrice(tokenIn); // tokenIn/tokenOut
        let gasCostInOutputToken;
        if (tokenOut.name === "ETH") {
            gasCostInOutputToken = gasCostEth;
        }
        else if (tokenIn.name === "ETH") {
            // Swap input ETH → output token
            gasCostInOutputToken = gasCostEth * spotPrice;
        }
        else {
            // Neither token is ETH, approximate via ETH as intermediate
            gasCostInOutputToken = gasCostEth * spotPrice; // rough estimate
        }
        const netOutput = Number(grossOutRaw) / Number(tokenOut.decimals) - gasCostInOutputToken;
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
