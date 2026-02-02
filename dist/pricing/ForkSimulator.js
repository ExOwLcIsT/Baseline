import { Contract, JsonRpcProvider } from "ethers";
import { Interface } from "ethers";
const pairIface = new Interface([
    "function swap(uint amount0Out,uint amount1Out,address to,bytes data)",
]);
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
];
export default class ForkSimulator {
    provider;
    constructor(fork_url) {
        this.provider = new JsonRpcProvider(fork_url);
    }
    async simulateSwap(pool, amountIn, amount0Out, amount1Out, sender, tokenIn) {
        try {
            // --- impersonate sender (для fork) ---
            await this.provider.send("hardhat_impersonateAccount", [
                sender.toString(),
            ]);
            const signer = await this.provider.getSigner(sender.toString());
            // --- підключаємо токен через Signer ---
            const tokenContract = new Contract(tokenIn.address.toString(), ERC20_ABI, signer);
            // --- transfer токени на пул ---
            await tokenContract.transfer(pool.address, amountIn);
            // --- encode swap ---
            const data = pairIface.encodeFunctionData("swap", [
                amount0Out,
                amount1Out,
                sender.toString(),
                "0x",
            ]);
            const tx = {
                from: sender.toString(),
                to: pool.address?.toString(),
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
            const res = await this.simulateSwap(route.pools[i], current, amount0Out, amount1Out, sender, route.path[i]);
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
}
