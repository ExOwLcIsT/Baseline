import { JsonRpcProvider } from "ethers";
import { Interface } from "ethers";
const pairIface = new Interface([
    "function swap(uint amount0Out,uint amount1Out,address to,bytes data)",
]);
export default class ForkSimulator {
    /*
      Simulates transactions on a local fork.
      */
    provider;
    constructor(fork_url) {
        /*
            fork_url: Local Anvil/Hardhat fork RPC
            */
        this.provider = new JsonRpcProvider(fork_url);
    }
    async simulateSwap(pair, amount0Out, amount1Out, sender) {
        try {
            const data = pairIface.encodeFunctionData("swap", [
                amount0Out,
                amount1Out,
                sender.toString(),
                "0x",
            ]);
            const tx = {
                to: pair.address?.toString(),
                from: sender.toString(),
                data,
                value: 0n,
            };
            const gasUsed = await this.provider.estimateGas(tx);
            const result = await this.provider.call(tx);
            return {
                success: true,
                amountOut: amount0Out + amount1Out,
                gasUsed,
                error: undefined,
                logs: [],
            };
        }
        catch (e) {
            return {
                success: false,
                amountOut: 0n,
                gasUsed: 0n,
                error: e?.message,
                logs: [],
            };
        }
    }
    async simulateRoute(route, amountIn, sender) {
        if (!route.pools || route.pools.length === 0) {
            throw new Error("Route has no pools to simulate");
        }
        let current = amountIn;
        let totalGas = 0n;
        for (let i = 0; i < route.hops; i++) {
            if (!route.pools[i].address) {
                throw new Error("Pool does not have address");
            }
            let amount0Out = 0n;
            let amount1Out = 0n;
            if (route.pools[i].token0.equals(route.path[route.hops])) {
                amount1Out = route.pools[i].getAmountOut(current, route.path[i]);
            }
            else if (route.pools[i].token1.equals(route.path[route.hops])) {
                amount0Out = route.pools[i].getAmountOut(current, route.path[i]);
            }
            else {
                throw new Error("Route token not in pool");
            }
            console.log("a0 " + amount0Out);
            console.log("a1 " + amount1Out);
            const res = await this.simulateSwap(route.pools[i], amount0Out, amount1Out, sender);
            if (!res.success) {
                return res;
            }
            current = res.amountOut;
            totalGas += res.gasUsed;
        }
        return {
            success: true,
            amountOut: current,
            gasUsed: totalGas,
            error: undefined,
            logs: [],
        };
    }
    async compareSimulationVSCalculation(pair, amountIn, tokenIn, router, swapParams, sender) {
        const calculated = pair.getAmountOut(amountIn, tokenIn);
        const simulated = await this.simulateSwap(pair, tokenIn.equals(pair.token0) ? 0n : pair.getAmountOut(amountIn, tokenIn), tokenIn.equals(pair.token1) ? 0n : pair.getAmountOut(amountIn, tokenIn), sender);
        return {
            calculated,
            simulated: simulated.amountOut,
            difference: calculated > simulated.amountOut
                ? calculated - simulated.amountOut
                : simulated.amountOut - calculated,
            match: calculated === simulated.amountOut,
        };
    }
    extractAmountOut(result) {
        if (!result || result === "0x")
            return 0n;
        return BigInt(result);
    }
}
