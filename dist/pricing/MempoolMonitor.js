import { WebSocketProvider, Interface } from "ethers";
import { Address } from "../core/BaseTypes/Address.js";
const V2_ABI = new Interface([
    "function swapExactTokensForTokens(uint amountIn,uint amountOutMin,address[] path,address to,uint deadline)",
    "function swapExactETHForTokens(uint amountOutMin,address[] path,address to,uint deadline)",
    "function swapExactTokensForETH(uint amountIn,uint amountOutMin,address[] path,address to,uint deadline)",
]);
export default class MempoolMonitor {
    provider;
    callback;
    static SWAP_SELECTORS = {
        "0x38ed1739": ["UniswapV2", "swapExactTokensForTokens"],
        "0x7ff36ab5": ["UniswapV2", "swapExactETHForTokens"],
        "0x18cbafe5": ["UniswapV2", "swapExactTokensForETH"],
        "0x5ae401dc": ["UniswapV3", "multicall"],
    };
    constructor(wsUrl, callback) {
        console.log(wsUrl);
        this.provider = new WebSocketProvider(wsUrl);
        this.callback = callback;
    }
    async start() {
        console.log("Listening mempool...");
        this.provider.on("pending", async (hash) => {
            try {
                const tx = await this.provider.getTransaction(hash);
                if (!tx || !tx.data)
                    return;
                const parsed = this.parseTransaction(tx);
                if (parsed)
                    this.callback(parsed);
            }
            catch {
                // ignore failed tx fetch
            }
        });
    }
    parseTransaction(tx) {
        if (!tx.data || tx.data.length < 10)
            return;
        const selector = tx.data.slice(0, 10).toLowerCase();
        const meta = MempoolMonitor.SWAP_SELECTORS[selector];
        if (!meta)
            return;
        const [dex, method] = meta;
        const params = this.decodeSwapParams(selector, tx.data);
        if (!params)
            return;
        const amountIn = params.amountIn ?? 0n;
        const minOut = params.amountOutMin ?? 0n;
        return {
            txHash: tx.hash,
            router: Address.fromString(tx.to),
            dex,
            method,
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amountIn,
            minAmountOut: minOut,
            deadline: params.deadline ?? 0n,
            sender: Address.fromString(tx.from),
            gasPrice: tx.gasPrice ?? 0n,
            slippageTolerance: this.calcSlippage(amountIn, minOut),
        };
    }
    decodeSwapParams(selector, data) {
        try {
            switch (selector) {
                case "0x38ed1739": {
                    const decoded = V2_ABI.decodeFunctionData("swapExactTokensForTokens", data);
                    const path = decoded.path;
                    return {
                        amountIn: decoded.amountIn,
                        amountOutMin: decoded.amountOutMin,
                        tokenIn: path[0],
                        tokenOut: path[path.length - 1],
                        deadline: decoded.deadline,
                    };
                }
                case "0x7ff36ab5": {
                    const decoded = V2_ABI.decodeFunctionData("swapExactETHForTokens", data);
                    const path = decoded.path;
                    return {
                        amountIn: 0n,
                        amountOutMin: decoded.amountOutMin,
                        tokenIn: undefined,
                        tokenOut: path[path.length - 1],
                        deadline: decoded.deadline,
                    };
                }
                case "0x18cbafe5": {
                    const decoded = V2_ABI.decodeFunctionData("swapExactTokensForETH", data);
                    const path = decoded.path;
                    return {
                        amountIn: decoded.amountIn,
                        amountOutMin: decoded.amountOutMin,
                        tokenIn: path[0],
                        tokenOut: undefined,
                        deadline: decoded.deadline,
                    };
                }
                default:
                    return undefined;
            }
        }
        catch {
            return undefined;
        }
    }
    calcSlippage(amountIn, minOut) {
        if (amountIn === 0n || minOut === 0n)
            return 0;
        const ratio = Number(minOut) / Number(amountIn);
        return (1 - ratio) * 100;
    }
}
