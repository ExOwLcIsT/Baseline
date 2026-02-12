import ChainClient from "../chain/ChainClient.js";
import { Address } from "../core/BaseTypes/Address.js";
import UniswapV2Pair from "./AMM.js";
import ForkSimulator from "./ForkSimulator.js";
import MempoolMonitor from "./MempoolMonitor.js";
import RouteFinder from "./RouteFinder.js";
import { Contract, Interface, parseEther } from "ethers";
import WalletManager from "../core/WalletManager.js";
import { TransactionBuilder } from "../chain/TransactionBuilder.js";
import TokenAmount from "../core/BaseTypes/TokenAmount.js";
import { Wallet } from "ethers";
export default class PricingEngine {
    /*
      Main interface for the pricing module.
      Integrates AMM math, routing, simulation, and mempool monitoring.
      */
    client;
    forkClient;
    simulator;
    monitor;
    pools;
    router;
    sender;
    constructor(chainClient, forkUrl, wsUrl, sender) {
        this.forkClient = new ChainClient(forkUrl);
        this.simulator = new ForkSimulator(forkUrl);
        this.monitor = new MempoolMonitor(wsUrl, this.onMempoolSwap);
        this.pools = new Map();
        this.router = undefined;
        this.sender = sender;
        this.client = chainClient;
    }
    async loadPools(pool_addresses) {
        // Load pool data from chain.
        for (let i = 0; i < pool_addresses.length; i++) {
            const pair = await UniswapV2Pair.fromChain(pool_addresses[i], this.forkClient);
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
    async getQuote(tokenIn, tokenOut, amountIn, gasPriceGwei) {
        /*
            Get best quote for a swap.
            */
        const [route, netOutput] = this.router.findBestRoute(tokenIn, tokenOut, amountIn, gasPriceGwei);
        // Verify with simulation
        const simResult = await this.simulator.simulateRoute(route, amountIn, this.sender);
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
    async swap(size, tokenIn, tokenOut) {
        const amountInDecimals = 10n ** BigInt(size.decimalPlaces());
        const amountIn = BigInt(size.mul(amountInDecimals).toNumber()) *
            (tokenIn.decimals / amountInDecimals);
        const simulated = await this.getQuote(tokenIn, tokenOut, amountIn, 0n);
        const routerAddress = Address.fromString(process.env.UNISWAP_V2_ROUTER_ADDRESS).checksum;
        const deadline = Math.floor(Date.now() / 1000) + 180;
        const wallet = WalletManager.fromEnv();
        if (tokenIn.address.checksum === "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2") {
            const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
            const WETH_ABI = [
                "function deposit() payable",
                "function withdraw(uint256 wad)",
                "function balanceOf(address) view returns (uint256)",
            ];
            const signer = new Wallet(process.env.PRIVATE_KEY, this.client.provider);
            const weth = new Contract(WETH_ADDRESS, WETH_ABI, signer);
            async function wrapETH(amountEth) {
                const tx = await weth.deposit({
                    value: parseEther(amountEth),
                });
                await tx.wait();
                //const balance = await weth.balanceOf(await signer.getAddress());
            }
            // Example: wrap 1 ETH
            await wrapETH("0.1");
        }
        const routerIface = new Interface([
            "function swapExactTokensForTokens(uint amountIn,uint amountOutMin,address[] path,address to,uint deadline) returns (uint[] amounts)",
        ]);
        const path = simulated.route.path.map((p) => p.address.checksum);
        const data = routerIface.encodeFunctionData("swapExactTokensForTokens", [
            amountIn,
            0n,
            path,
            routerAddress,
            deadline,
        ]);
        let decimals = 0;
        let tokenDecimals = tokenIn.decimals;
        for (; tokenDecimals / 10n > 0; decimals++) {
            tokenDecimals /= 10n;
        }
        const tx = (await (await new TransactionBuilder(this.client, wallet)
            .to(Address.fromString(process.env.UNISWAP_V2_ROUTER_ADDRESS))
            .value(TokenAmount.fromHuman(tokenIn.address.checksum ===
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
            ? "0"
            : size.toString(), decimals, ""))
            .data(data)
            .withGasEstimate()).withGasPrice("medium")).build();
        const signedTx = await wallet.signTransaction(tx);
        await this.client.sendTransaction(signedTx);
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
