import { Contract } from "ethers";
import ChainClient from "../chain/ChainClient.js";
import { Address } from "../core/BaseTypes/Address.js";
import UniswapV2Pair from "./AMM.js";
import Token from "./Token.js";
import * as dotenv from "dotenv";
function parseArg(flag) {
    const arg = process.argv.find((a) => a.startsWith(flag + "="));
    return arg?.split("=")[1];
}
function parseSizes(str) {
    return str.split(",").map((x) => BigInt(x.trim()));
}
function format(n, digits = 4) {
    return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
async function loadToken(addr, client) {
    const abi = [
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
    ];
    const c = new Contract(addr, abi, client.provider);
    const [symbol, decimals] = await Promise.all([c.symbol(), c.decimals()]);
    return new Token(symbol, BigInt(decimals), Address.fromString(addr));
}
class PriceImpactAnalyzer {
    /*
      Analyzes price impact across different trade sizes.
      */
    pair;
    constructor(pair) {
        this.pair = pair;
    }
    generateImpactTable(token_in, sizes) {
        /*
            Returns list of:
            {
                'amount_in': int,
                'amount_out': int,
                'spot_price': Decimal,
                'execution_price': Decimal,
                'price_impact_pct': Decimal,
            }
        */
        const rows = [];
        const tokenIn = token_in === this.pair.token0.name ? this.pair.token0 : this.pair.token1;
        const tokenOut = token_in === this.pair.token0.name ? this.pair.token1 : this.pair.token0;
        const spot = this.pair.getSpotPrice(tokenIn);
        for (const amountIn of sizes) {
            const amountOut = this.pair.getAmountOut(amountIn, tokenIn);
            const executionPrice = this.pair.getExecutionPrice(amountIn, tokenIn);
            const impactPct = this.pair.getPriceImpact(amountIn, tokenIn);
            rows.push({
                amountIn: amountIn / tokenIn.decimals,
                amountOut: amountOut / tokenOut.decimals,
                spotPrice: spot,
                executionPrice: executionPrice,
                priceImpactPct: impactPct,
            });
        }
        return rows;
    }
    findMaxSizeForImpact(tokenIn, maxImpactPct) {
        /*
          Binary search to find largest trade with impact <= max_impact_pct.
          */
        const maxValue = this.pair.token0.equals(tokenIn)
            ? this.pair.reserve0
            : this.pair.reserve1;
        return this.findMaxSizeForImpactRecursion(tokenIn, maxImpactPct, 0n, maxValue);
    }
    findMaxSizeForImpactRecursion(tokenIn, maxImpactPct, min, max) {
        const value = (max + min) / 2n;
        const priceImpact = this.pair.getPriceImpact(value, tokenIn);
        if (max === min)
            return value;
        if (priceImpact > maxImpactPct)
            return this.findMaxSizeForImpactRecursion(tokenIn, maxImpactPct, min, value);
        if (priceImpact < maxImpactPct) {
            return this.findMaxSizeForImpactRecursion(tokenIn, maxImpactPct, value, max);
        }
        return value;
    }
    estimateTrueCost(amountIn, tokenIn, gasPriceGwei, gasEstimate = 150_000) {
        const tokenOut = tokenIn.equals(this.pair.token0)
            ? this.pair.token1
            : this.pair.token0;
        // Calculate gross output from swap
        const grossOutRaw = this.pair.getAmountOut(amountIn, tokenIn);
        // Gas cost in ETH
        const gasCostEth = (gasEstimate * gasPriceGwei) / 1e9;
        // Convert gas cost to output token units via spot price
        const spotPrice = this.pair.getSpotPrice(tokenIn); // tokenIn/tokenOut
        let gasCostInOutputToken;
        if (tokenOut.name === "ETH") {
            gasCostInOutputToken = gasCostEth;
        }
        else if (tokenIn.name === "ETH") {
            // Swap input ETH → output token
            gasCostInOutputToken = gasCostEth * spotPrice;
        }
        else {
            // Neither token is ETH, approximate via ETH as intermediate
            gasCostInOutputToken = gasCostEth * spotPrice; // rough estimate
        }
        const netOutput = Number(grossOutRaw) / Number(tokenOut.decimals) - gasCostInOutputToken;
        const effectivePrice = Number(amountIn) / netOutput;
        return {
            grossOutput: grossOutRaw,
            gasCostEth,
            gasCostInOutputToken,
            netOutput,
            effectivePrice,
        };
    }
}
async function main() {
    dotenv.config();
    const pairAddrStr = process.argv[2];
    const tokenInSymbol = parseArg("--token-in");
    const sizesArg = parseArg("--sizes");
    if (!pairAddrStr || !tokenInSymbol || !sizesArg) {
        console.log(`
Usage:
node impact_analyzer.js <pair_address> --token-in=USDC --sizes=1000,10000,100000 
`);
        process.exit(1);
    }
    const sizes = parseSizes(sizesArg);
    const client = new ChainClient();
    console.log("Fetching pair data from chain...");
    /* -------------------------
       Load pair
    -------------------------- */
    const pairAddress = Address.fromString(pairAddrStr);
    const abi = [
        "function token0() view returns (address)",
        "function token1() view returns (address)",
        "function getReserves() view returns (uint112,uint112,uint32)",
    ];
    const contract = new Contract(pairAddrStr, abi, client.provider);
    const [t0Addr, t1Addr, reserves] = await Promise.all([
        contract.token0(),
        contract.token1(),
        contract.getReserves(),
    ]);
    const reserve0 = BigInt(reserves[0]);
    const reserve1 = BigInt(reserves[1]);
    const token0 = await loadToken(t0Addr, client);
    const token1 = await loadToken(t1Addr, client);
    token0.decimals = BigInt(10 ** Number(token0.decimals));
    token1.decimals = BigInt(10 ** Number(token1.decimals));
    const pair = new UniswapV2Pair(token0, token1, reserve0, reserve1, pairAddress);
    /* -------------------------
       Select tokenIn
    -------------------------- */
    const tokenIn = tokenInSymbol.toUpperCase() === token0.name
        ? token0
        : tokenInSymbol.toUpperCase() === token1.name
            ? token1
            : null;
    if (!tokenIn)
        throw new Error(`Token ${tokenInSymbol} not found in pair (${token0.name}/${token1.name})`);
    const tokenOut = tokenIn.equals(token0) ? token1 : token0;
    const analyzer = new PriceImpactAnalyzer(pair);
    /* =========================================================
       Header
    ========================================================= */
    console.log(`\nPrice Impact Analysis for ${tokenIn.name} → ${tokenOut.name}`);
    console.log(`Pool: ${pairAddrStr}`);
    const spot = pair.getSpotPrice(tokenIn);
    console.log(`Reserves: ${format(Number(pair.reserve0))} ${token0.name} / ${format(Number(pair.reserve1))} ${token1.name}`);
    console.log(`Spot Price: ${format(spot, 6)} ${tokenIn.name}/${tokenOut.name}\n`);
    /* =========================================================
       Table
    ========================================================= */
    console.log("-".repeat(66));
    console.log(`│ ${"In".padStart(10)} │ ${"Out".padStart(22)} │ ${"Exec Price".padStart(12)} │ ${"Impact %".padStart(9)} │`);
    console.log("-".repeat(66));
    for (let i = 0; i < sizes.length; i++) {
        sizes[i] *= tokenIn.decimals;
    }
    const rows = analyzer.generateImpactTable(tokenIn.name, sizes);
    for (const r of rows) {
        console.log(`│ ${format(r.amountIn).padStart(10)} │ ${format(r.amountOut).padStart(22)} │ ${format(r.executionPrice, 6).padStart(12)} │ ${format(r.priceImpactPct, 4).padStart(9)} │`);
    }
    console.log("-".repeat(66));
    /* =========================================================
       Extra info
    ========================================================= */
    const max = analyzer.findMaxSizeForImpact(tokenIn, 1);
    console.log(`\nMax trade for 1% impact: ${format(Number(max))} ${tokenIn.name}\n`);
}
/* ========================================================= */
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
export default PriceImpactAnalyzer;
