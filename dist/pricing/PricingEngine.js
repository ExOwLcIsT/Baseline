import UniswapV2Pair from "./AMM.js";
import ForkSimulator from "./ForkSimulator.js";
import MempoolMonitor from "./MempoolMonitor.js";
import RouteFinder from "./RouteFinder.js";
export default class PricingEngine {
    /*
      Main interface for the pricing module.
      Integrates AMM math, routing, simulation, and mempool monitoring.
      */
    client;
    simulator;
    monitor;
    pools;
    router;
    constructor(chainClient, forkUrl, wsUrl) {
        this.client = chainClient;
        this.simulator = new ForkSimulator(forkUrl);
        this.monitor = new MempoolMonitor(wsUrl, this.onMempoolSwap);
        this.pools = new Map();
        this.router = undefined;
    }
    async load_pools(pool_addresses) {
        // Load pool data from chain.
        pool_addresses.forEach(async (addr) => {
            this.pools.set(addr, await UniswapV2Pair.fromChain(addr, this.client));
        });
        this.router = new RouteFinder(Array.from(this.pools.values()));
    }
    refreshPool(address) {
        // Refresh single pool's reserves.
        const pair = this.pools.get(address);
        if (!pair)
            return;
        pair.refreshReserves(this.client);
    }
    async get_quote(tokenIn, tokenOut, amountIn, gasPriceGwei) {
        /*
            Get best quote for a swap.
            */
        const [route, netOutput] = this.router.findBestRoute(tokenIn, tokenOut, amountIn, gasPriceGwei);
        // Verify with simulation
        const simResult = await this.simulator.simulateRoute(route, amountIn);
        if (!simResult.success) {
            throw Error("Simulation failed: {sim_result.error}");
        }
        return new Quote(route, amountIn, netOutput, simResult.amountOut, simResult.gasUsed, Date.now());
    }
    onMempoolSwap(swap) {
        // Handle detected mempool swap.
        // Check if it affects any of our pools
        // Could trigger re-quote or alert
        console.log("Swap detected:", swap);
        console.log(`Detected swap: ${swap.dex} ${swap.method}`);
        console.log(`${swap.amountIn} → min ${swap.minAmountOut}`);
        console.log(` Slippage tolerance: ${swap.slippageTolerance}`);
        this.simulator.simulateSwap(swap.router, { data: "0x", value: swap.amountIn }, swap.sender);
        for (const pool of this.pools.values()) {
            if (pool.token0.address?.lower === swap.tokenIn?.lower ||
                pool.token1.address?.lower === swap.tokenIn?.lower) {
                this.refreshPool(pool.address);
            }
        }
    }
}
export class Quote {
    route;
    amountIn;
    expectedOutput;
    simulatedOutput;
    gasEstimate;
    timestamp;
    constructor(route, amountIn, expectedOutput, simulatedOutput, gasEstimate, timestamp) {
        this.route = route;
        this.amountIn = amountIn;
        this.expectedOutput = expectedOutput;
        this.simulatedOutput = simulatedOutput;
        this.gasEstimate = gasEstimate;
        this.timestamp = timestamp;
    }
    get isValid() {
        //Quote valid if simulation matches expectation within tolerance."
        const tolerance = 0.001; // 0.1%
        const diff = Math.abs(Number(this.expectedOutput - this.simulatedOutput / this.expectedOutput));
        return diff < tolerance;
    }
}
