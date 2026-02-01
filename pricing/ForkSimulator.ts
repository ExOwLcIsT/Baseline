import { JsonRpcProvider } from "ethers";
import { Address } from "../core/BaseTypes/Address.js";
import UniswapV2Pair from "./AMM.js";
import Route from "./Route.js";
import Token from "./Token.js";

export default class ForkSimulator {
  /*
    Simulates transactions on a local fork.
    */
  private provider: JsonRpcProvider;
  constructor(fork_url: string) {
    /*
        fork_url: Local Anvil/Hardhat fork RPC
        */
    this.provider = new JsonRpcProvider(fork_url);
  }
  async simulateSwap(
    router: Address,
    swapParams: {
      data: string;
      value?: bigint;
    },
    sender: Address,
  ): Promise<SimulationResult> {
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
  private async simulatePoolSwap(
    pool: UniswapV2Pair,
    tokenIn: Token,
    amountIn: bigint,
  ): Promise<SimulationResult> {
    try {
      const amountOut = pool.getAmountOut(amountIn, tokenIn);
      //TODO
      //Fork
      return {
        success: true,
        amountOut,
        gasUsed: 150_000n,
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
  ): Promise<SimulationResult> {
    let current = BigInt(amountIn);
    const totalGas = route.estimateGas();

    for (let i = 0; i < route.pools.length; i++) {
      const pool = route.pools[i];
      const tokenIn = route.path[i];

      const res = await this.simulatePoolSwap(pool, tokenIn, amountIn);

      if (!res.success) return res;

      current = res.amountOut;
    }

    return {
      success: true,
      amountOut: current,
      gasUsed: totalGas,
      error: undefined,
      logs: [],
    };
  }

  async compareSimulationVSCalculation(
    pair: UniswapV2Pair,
    amountIn: bigint,
    tokenIn: Token,
    router: Address,
    swapParams: { data: string; value?: bigint },
    sender: Address,
  ): Promise<Record<string, any>> {
    const calculated = pair.getAmountOut(amountIn, tokenIn);
    const simulated = await this.simulateSwap(router, swapParams, sender);

    return {
      calculated,
      simulated: simulated.amountOut,
      difference:
        calculated > simulated.amountOut
          ? calculated - simulated.amountOut
          : simulated.amountOut - calculated,
      match: calculated === simulated.amountOut,
    };
  }

  private extractAmountOut(result: string): bigint {
    if (!result || result === "0x") return 0n;
    return BigInt(result);
  }
}

export interface SimulationResult {
  success: boolean;
  amountOut: bigint;
  gasUsed: bigint;
  error: string | undefined;
  logs: any[];
}
