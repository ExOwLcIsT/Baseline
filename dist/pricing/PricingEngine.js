import ChainClient from "../chain/ChainClient.js";
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
        this.client = new ChainClient(forkUrl);
        this.simulator = new ForkSimulator(forkUrl);
        this.monitor = new MempoolMonitor(wsUrl, this.onMempoolSwap);
        this.pools = new Map();
        this.router = undefined;
    }
    async loadPools(pool_addresses) {
        // Load pool data from chain.
        for (let i = 0; i < pool_addresses.length; i++) {
            const pair = await UniswapV2Pair.fromChain(pool_addresses[i], this.client);
            this.pools.set(pool_addresses[i], pair);
        }
        this.router = new RouteFinder(Array.from(this.pools.values()));
    }
    refreshPool(address) {
        // Refresh single pool's reserves.
        const pair = this.pools.get(address);
        if (!pair)
            return;
        pair.refreshReserves(this.client);
    }
    async getQuote(tokenIn, tokenOut, amountIn, gasPriceGwei, sender) {
        /*
            Get best quote for a swap.
            */
        const [route, netOutput] = this.router.findBestRoute(tokenIn, tokenOut, amountIn, gasPriceGwei);
        console.log(route);
        // Verify with simulation
        const simResult = await this.simulator.simulateRoute(route, amountIn, sender);
        if (!simResult.success) {
            throw Error(`Simulation failed: ${simResult.error}`);
        }
        return new Quote(route, amountIn, netOutput, simResult.amountOut, simResult.gasUsed, Date.now());
    }
    async onMempoolSwap(swap) {
        // Handle detected mempool swap.
        // Check if it affects any of our pools
        // Could trigger re-quote or alert
        console.log("Swap detected:", swap);
        console.log(`Detected swap: ${swap.dex} ${swap.method}`);
        console.log(`${swap.amountIn} → min ${swap.minAmountOut}`);
        console.log(` Slippage tolerance: ${swap.slippageTolerance}`);
        if (this.pools) {
            for (const pool of this.pools.values()) {
                if (pool.token0.address?.lower === swap.tokenIn?.lower ||
                    pool.token1.address?.lower === swap.tokenIn?.lower) {
                    this.refreshPool(pool.address);
                }
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
