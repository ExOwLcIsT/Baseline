import Token from "./Token.js";
class UniswapV2Pair {
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
    constructor(token0, token1, reserve0, reserve1, address, // 0.30% = 30 basis points
    feeBPS = 30) {
        this.address = address;
        this.token0 = token0;
        this.token1 = token1;
        this.reserve0 = reserve0;
        this.reserve1 = reserve1;
        this.feeBPS = feeBPS;
    }
    copy() {
        return new UniswapV2Pair(this.token0, this.token1, this.reserve0, this.reserve1, this.address);
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
        const amountInWithFee = amountIn * BigInt(10000 - this.feeBPS);
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
        const reserveIn = direction
            ? Number(this.reserve1) / Number(this.token1.decimals)
            : Number(this.reserve0) / Number(this.token0.decimals);
        //Reserve that is decreased
        const reserveOut = direction
            ? Number(this.reserve0 - amountOut) / Number(this.token0.decimals)
            : Number(this.reserve1 - amountOut) / Number(this.token1.decimals);
        const numenator = (reserveIn * 10000 * Number(amountOut)) / Number(tokenOut.decimals);
        const denumenator = reserveOut;
        const amountInWithFee = numenator / denumenator;
        const amountIn = amountInWithFee / (10000 - this.feeBPS);
        return Math.ceil(amountIn);
    }
    getSpotPrice(tokenIn) {
        /*
          Returns spot price (for display only, not calculations).
          */
        if (!tokenIn.equals(this.token0) && !tokenIn.equals(this.token1))
            throw new Error("Invalid token");
        const direction = tokenIn.name === this.token0.name;
        const num = direction
            ? Number(this.reserve0) / Number(this.token0.decimals)
            : Number(this.reserve1) / Number(this.token1.decimals);
        const denum = direction
            ? Number(this.reserve1) / Number(this.token1.decimals)
            : Number(this.reserve0) / Number(this.token0.decimals);
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
        const executionPrice = Number(amountIn) / amountOut;
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
        return Math.round(((executionPrice - spotPrice) / spotPrice) * 10000) / 100;
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
            copy.reserve0 += amountIn;
            copy.reserve1 -= amountOut;
        }
        else {
            copy.reserve1 += amountIn;
            copy.reserve0 -= amountOut;
        }
        return copy;
    }
    static async fromChain(address, client) {
        const { Contract } = await import("ethers");
        const pairAbi = [
            "function token0() view returns (address)",
            "function token1() view returns (address)",
            "function getReserves() view returns (uint112,uint112,uint32)",
        ];
        const erc20Abi = [
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)",
        ];
        const pair = new Contract(address.lower, pairAbi, client.provider);
        // -------------------
        // fetch pair data
        // -------------------
        const [addr0, addr1, reserves] = await Promise.all([
            pair.token0(),
            pair.token1(),
            pair.getReserves(),
        ]);
        const reserve0 = BigInt(reserves[0]);
        const reserve1 = BigInt(reserves[1]);
        // -------------------
        // fetch token metadata
        // -------------------
        const token0Contract = new Contract(addr0, erc20Abi, client.provider);
        const token1Contract = new Contract(addr1, erc20Abi, client.provider);
        const [name0, symbol0, decimals0, name1, symbol1, decimals1] = await Promise.all([
            token0Contract.name(),
            token0Contract.symbol(),
            token0Contract.decimals(),
            token1Contract.name(),
            token1Contract.symbol(),
            token1Contract.decimals(),
        ]);
        // -------------------
        // build tokens
        // -------------------
        const token0 = new Token(symbol0, BigInt(10) ** BigInt(decimals0), addr0);
        const token1 = new Token(symbol1, BigInt(10) ** BigInt(decimals1), addr1);
        // -------------------
        // return pair
        // -------------------
        return new UniswapV2Pair(token0, token1, reserve0, reserve1, address);
    }
    refreshReserves(client) {
        return UniswapV2Pair.fromChain(this.address, client);
    }
}
export default UniswapV2Pair;
