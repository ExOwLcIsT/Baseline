import { Contract, JsonRpcProvider, getAddress } from "ethers";
import { Address } from "../core/BaseTypes/Address.js";

import { Interface } from "ethers";
import UniswapV2Pair from "../pricing/AMM.js";
import Token from "../pricing/Token.js";
import Route from "../pricing/Route.js";

const pairIface = new Interface([
  "function swap(uint amount0Out,uint amount1Out,address to,bytes data)",
]);

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

export interface SimulationResult {
  success: boolean;
  amountOut: bigint;
  gasUsed: bigint;
  error: string | undefined;
  logs: any[];
}

export default class ForkSimulator {
  private provider: JsonRpcProvider;

  constructor(forkUrl: string) {
    this.provider = new JsonRpcProvider(forkUrl);
  }

  async simulateSwap(
    pool: UniswapV2Pair,
    amountIn: bigint,
    amount0Out: bigint,
    amount1Out: bigint,
    sender: Address,
    tokenIn: Token,
  ): Promise<SimulationResult> {
    try {
      if (!pool.address) throw new Error("Pool has no address");

      const from = getAddress(sender.toString());
      const to = getAddress(pool.address.toString());

      await this.provider.send("hardhat_impersonateAccount", [from]);
      const signer = await this.provider.getSigner(from);

      const tokenContract = new Contract(
        tokenIn.address.toString(),
        ERC20_ABI,
        signer,
      );

      const balance = await tokenContract.balanceOf(from);
      if (BigInt(balance.toString()) < amountIn) {
        throw new Error(
          `Insufficient token balance for simulation. Have ${balance}, need ${amountIn}`,
        );
      }

      await tokenContract.transfer(to, amountIn);

      const data = pairIface.encodeFunctionData("swap", [
        amount0Out,
        amount1Out,
        from,
        "0x",
      ]);

      const tx = {
        from,
        to,
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
    } catch (e: any) {
      return {
        success: false,
        amountOut: 0n,
        gasUsed: 0n,
        error: e?.message,
        logs: [],
      };
    }
  }

  async simulateRoute(
    route: Route,
    amountIn: bigint,
    sender: Address,
  ): Promise<SimulationResult> {
    if (!route.pools || route.pools.length === 0) {
      throw new Error("Route has no pools to simulate");
    }

    let current = amountIn;
    let totalGas = 0n;

    for (let i = 0; i < route.hops; i++) {
      const pool = route.pools[i];
      if (!pool.address) throw new Error("Pool does not have address");

      let amount0Out = 0n;
      let amount1Out = 0n;

      if (pool.token0.equals(route.path[route.hops])) {
        amount1Out = pool.getAmountOut(current, route.path[i]);
      } else if (pool.token1.equals(route.path[route.hops])) {
        amount0Out = pool.getAmountOut(current, route.path[i]);
      } else {
        throw new Error("Route token not in pool");
      }

      const res = await this.simulateSwap(
        pool,
        current,
        amount0Out,
        amount1Out,
        sender,
        route.path[i],
      );

      if (!res.success) return res;

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
