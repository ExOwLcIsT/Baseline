import { JsonRpcProvider } from "ethers";
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
    async simulateSwap(router, swapParams, sender) {
        try {
            const tx = {
                to: router.toString(),
                from: sender.toString(),
                data: swapParams.data,
                value: swapParams.value ?? 0n,
            };
            const gasUsed = await this.provider.estimateGas(tx);
            const result = await this.provider.call(tx);
            return {
                success: true,
                amountOut: this.extractAmountOut(result),
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
    async simulatePoolSwap(pool, tokenIn, amountIn) {
        try {
            const amountOut = pool.getAmountOut(amountIn, tokenIn);
            return {
                success: true,
                amountOut,
                gasUsed: 110000n,
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
    async simulateRoute(route, amountIn) {
        let current = BigInt(amountIn);
        let totalGas = 0n;
        for (let i = 0; i < route.pools.length; i++) {
            const pool = route.pools[i];
            const tokenIn = route.path[i];
            const res = await this.simulatePoolSwap(pool, tokenIn, amountIn);
            if (!res.success)
                return res;
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
        const simulated = await this.simulateSwap(router, swapParams, sender);
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
