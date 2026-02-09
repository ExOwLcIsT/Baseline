import { Contract, formatEther, JsonRpcProvider, parseEther } from "ethers";
import { Address } from "../core/BaseTypes/Address.js";

import { Interface } from "ethers";
import UniswapV2Pair from "../pricing/AMM.js";
import Token from "../pricing/Token.js";
import Route from "../pricing/Route.js";

const routerIface = new Interface([
  "function swapExactTokensForTokens(uint amountIn,uint amountOutMin,address[] path,address to,uint deadline) returns (uint[] amounts)",
]);
const quoteIface = new Interface([
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
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

      const signer = await this.provider.getSigner(sender.checksum); // your test account

      const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
      const WETH_ABI = [
        "function deposit() payable",
        "function withdraw(uint256 wad)",
        "function balanceOf(address) view returns (uint256)",
      ];

      const weth = new Contract(WETH_ADDRESS, WETH_ABI, signer);

      async function wrapETH(amountEth: string) {
        const tx = await weth.deposit({
          value: parseEther(amountEth),
        });
        await tx.wait();

        const balance = await weth.balanceOf(await signer.getAddress());
      }

      // Example: wrap 1 ETH
      await wrapETH("10");

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
        //value: swapParams.amountIn,
      };
      const ERC20_ABI = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function balanceOf(address account) view returns (uint256)",
      ];

      const wethApprove = new Contract(swapParams.path[0], ERC20_ABI, signer);

      // Approve the router to spend your WETH
      async function approveRouter() {
        const tx = await wethApprove.approve(
          router.checksum,
          swapParams.amountIn,
        );
        await tx.wait();
      }

      await approveRouter();
      const gasUsed = await this.provider.estimateGas(tx);
      const result = await this.provider.call(tx);
      const amountsOutData = quoteIface.encodeFunctionData("getAmountsOut", [
        swapParams.amountIn,
        swapParams.path,
      ]);
      const raw = await this.provider.call({
        to: router.checksum,
        data: amountsOutData,
      });

      const routerContract = new Contract(
        router.checksum,
        quoteIface,
        this.provider,
      );
      const amounts = await routerContract.getAmountsOut(
        swapParams.amountIn,
        swapParams.path,
      );

      //const [amounts] = quoteIface.decodeFunctionResult("getAmountsOut", raw);
      const amountOut = amounts.at(-1);
      return {
        success: true,
        amountOut: amountOut,
        gasUsed: gasUsed,
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
    const deadline = Math.floor(Date.now() / 1000) + 180;
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
