export class UniswapV2Pair {
    /*
      Represents a Uniswap V2 liquidity pair.
      All math uses integers only — no floats anywhere.
      */
    address;
    token0;
    token1;
    reserve0;
    reserve1;
    feeBPS;
    constructor(address, token0, token1, reserve0, reserve1, feeBPS = 30) {
        this.address = address;
        this.token0 = token0;
        this.token1 = token1;
        this.reserve0 = reserve0 * token0.decimals;
        this.reserve1 = reserve1 * token1.decimals;
        this.feeBPS = feeBPS;
    }
    copy() {
        return new UniswapV2Pair(this.address, this.token0, this.token1, this.reserve0, this.reserve1);
    }
    getAmountOut(amountIn, tokenIn) {
        /*
          Calculate output amount for a given input.
          Must match Solidity exactly:
    
          amount_in_with_fee = amount_in * (10000 - fee_bps)
          numerator = amount_in_with_fee * reserve_out
          denominator = reserve_in * 10000 + amount_in_with_fee
          amount_out = numerator // denominator
          */
        if (!tokenIn.equals(this.token0) && !tokenIn.equals(this.token1))
            throw new Error("Invalid token");
        const direction = tokenIn.name === this.token0.name;
        const amountInWithFee = BigInt(amountIn * (10000 - this.feeBPS)) * tokenIn.decimals;
        //Reserve that is increased (with counted fee)
        const reserveIn = direction ? this.reserve0 : this.reserve1;
        //Reserve that is decreased
        const reserveOut = direction ? this.reserve1 : this.reserve0;
        const numenator = reserveOut * amountInWithFee;
        const denumenator = BigInt(Number(reserveIn) * 10000) + amountInWithFee;
        const amountOut = numenator / denumenator;
        return amountOut;
    }
    getAmountIn(amountOut, tokenOut) {
        /*
          Calculate required input for desired output.
          (Inverse of get_amount_out)
          */
        if (!tokenOut.equals(this.token0) && !tokenOut.equals(this.token1))
            throw new Error("Invalid token");
        const direction = tokenOut.name === this.token0.name;
        //Reserve that is increased (with counted fee)
        const reserveIn = direction ? this.reserve1 : this.reserve0;
        //Reserve that is decreased
        const reserveOut = direction ? this.reserve0 : this.reserve1;
        const numenator = BigInt(Number(reserveIn) * 10000) * amountOut;
        const denumenator = reserveOut - amountOut;
        const amountInWithFee = numenator / denumenator;
        const amountIn = Number(amountInWithFee) /
            (10000 - this.feeBPS) /
            Number(direction ? this.token1.decimals : this.token0.decimals);
        return Math.ceil(amountIn);
    }
    getSpotPrice(tokenIn) {
        /*
          Returns spot price (for display only, not calculations).
          */
        if (!tokenIn.equals(this.token0) && !tokenIn.equals(this.token1))
            throw new Error("Invalid token");
        const direction = tokenIn.name === this.token0.name;
        const num = Number(direction
            ? this.reserve0 / this.token0.decimals
            : this.reserve1 / this.token1.decimals);
        const denum = Number(direction
            ? this.reserve1 / this.token1.decimals
            : this.reserve0 / this.token0.decimals);
        return num / denum;
    }
    getExecutionPrice(amountIn, tokenIn) {
        /*
          Returns actual execution price for given trade size.
          */
        if (!tokenIn.equals(this.token0) && !tokenIn.equals(this.token1))
            throw new Error("Invalid token");
        const amountOut = Number(this.getAmountOut(amountIn, tokenIn)) /
            Number(tokenIn.name === this.token0.name
                ? this.token1.decimals
                : this.token0.decimals);
        const executionPrice = amountIn / amountOut;
        return executionPrice;
    }
    getPriceImpact(amountIn, tokenIn) {
        /*
          Returns price impact as a decimal (0.01 = 1%).
          */
        if (!tokenIn.equals(this.token0) && !tokenIn.equals(this.token1))
            throw new Error("Invalid token");
        const spotPrice = this.getSpotPrice(tokenIn);
        const executionPrice = this.getExecutionPrice(amountIn, tokenIn);
        return ((executionPrice - spotPrice) / spotPrice) * 100;
    }
    simulateSwap(amountIn, tokenIn) {
        /*
          Returns a NEW pair with updated reserves after the swap.
          (Useful for multi-hop simulation)
          */
        if (!tokenIn.equals(this.token0) && !tokenIn.equals(this.token1))
            throw new Error("Invalid token");
        const direction = tokenIn.name === this.token0.name;
        const copy = this.copy();
        const amountOut = this.getAmountOut(amountIn, tokenIn);
        if (direction) {
            copy.reserve0 += BigInt(amountIn * Number(tokenIn.decimals));
            copy.reserve1 -= amountOut;
        }
        else {
            copy.reserve1 += BigInt(amountIn * Number(tokenIn.decimals));
            copy.reserve0 -= amountOut;
        }
        return copy;
    }
}
