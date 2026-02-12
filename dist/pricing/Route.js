import { Decimal } from "decimal.js";
class Route {
    // Represents a swap route through one or more pools.
    pools;
    path;
    constructor(pools, path) {
        if (pools.length !== path.length - 1)
            throw new Error("Count of tokens must be pools + 1");
        this.pools = pools;
        this.path = path; // token_in → intermediate... → token_out
    }
    get hops() {
        return this.pools.length;
    }
    getOutput(amountIn) {
        // Simulate full route, return final output.x
        let amountOut = amountIn;
        for (let i = 0; i < this.hops; i++) {
            amountOut = this.pools[i].getAmountOut(amountOut, this.path[i]);
        }
        return amountOut;
    }
    getInput(amountOut) {
        // Simulate full route, return final output.x
        let amountIn = amountOut;
        for (let i = 0; i <= 0; i++) {
            amountIn = this.pools[i].getAmountIn(amountIn, this.path[i]);
        }
        return amountIn;
    }
    getSlippage(amountIn) {
        let spotPrice = Decimal(1);
        const amountOut = this.getOutput(amountIn);
        for (let i = 0; i < this.pools.length; i++) {
            spotPrice = spotPrice.mul(this.pools[i].getSpotPrice(this.path[i]));
        }
        const executionPrice = Decimal(Number(amountIn) /
            Number(this.path[0].decimals) /
            (Number(amountOut) / Number(this.path[this.path.length - 1].decimals)));
        return executionPrice
            .sub(spotPrice)
            .div(spotPrice)
            .mul(10000)
            .toDecimalPlaces(2);
    }
    getIntermediateAmounts(amountIn) {
        //Return amount at each step: [input, after_hop1, after_hop2, ...]
        const amounts = [];
        amounts.push(amountIn);
        for (let i = 0; i < this.hops - 1; i++) {
            const amountOut = this.pools[i].getAmountOut(amountIn, this.path[i]);
            amounts.push(amountOut);
            amountIn = amountOut;
        }
        const amountOut = this.pools[this.hops - 1].getAmountOut(amountIn, this.path[this.hops]);
        amounts.push(amountOut);
        return amounts;
    }
    estimateGas() {
        // Estimate gas: ~150k base + ~100k per hop.
        const base = 150_000;
        const perHop = 100_000;
        return BigInt(base + (this.hops - 1) * perHop);
    }
}
export default Route;
