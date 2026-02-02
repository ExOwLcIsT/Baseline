import { JsonRpcProvider } from "ethers";
import { Address } from "../core/BaseTypes/Address.js";

import { Interface } from "ethers";
import UniswapV2Pair from "../pricing/AMM.js";
import Token from "../pricing/Token.js";
import Route from "../pricing/Route.js";

const routerIface = new Interface([
  "function swapExactTokensForTokens(uint amountIn,uint amountOutMin,address[] path,address to,uint deadline) returns (uint[] amounts)",
]);

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
    router: Address,
    swapParams: {
      amountIn: bigint;
      amountOutMin: bigint;
      path: string[];
      deadline: number;
    },
    sender: Address,
  ): Promise<SimulationResult> {
    try {
      if (!router) throw new Error("No router address");

      const data = routerIface.encodeFunctionData("swapExactTokensForTokens", [
        swapParams.amountIn,
        swapParams.amountOutMin,
        swapParams.path,
        router.checksum,
        swapParams.deadline,
      ]);

      const tx = {
        from: sender.checksum,
        to: router.checksum,
        data,
        value: swapParams.amountIn,
      };

      const gasUsed = await this.provider.estimateGas(tx);
      const result = await this.provider.call(tx);

      return {
        success: true,
        amountOut: 0n,
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

    const path = route.path.map((t) => t.address.checksum);
    const deadline = Date.now() + 3000;
    const res = await this.simulateSwap(
      Address.fromString("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"),
      {
        amountIn,
        amountOutMin: 0n,
        path,
        deadline,
      },
      sender,
    );

    return {
      success: res.success,
      amountOut: res.amountOut,
      gasUsed: res.gasUsed,
      error: res.error,
      logs: res.logs,
    };
  }
}
