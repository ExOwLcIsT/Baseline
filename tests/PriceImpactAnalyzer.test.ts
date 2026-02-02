import { Address } from "../core/BaseTypes/Address";
import UniswapV2Pair from "../pricing/AMM";
import Token from "../pricing/Token";
import PriceImpactAnalyzer from "../pricing/PriceImpactAnalyzer";

import { describe, expect, test } from "vitest";

describe("PriceImpactAnalyzer", () => {
  const ETHToken = new Token(
    "ETH",
    10n ** 18n,
    Address.fromString("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"),
  );
  const USDCToken = new Token(
    "USDC",
    10n ** 6n,
    Address.fromString("0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
  );

  const pair = new UniswapV2Pair(
    ETHToken,
    USDCToken,
    1000n * 10n ** 18n, //# 1000 ETH
    2_000_000n * 10n ** 6n, // 2M USDC
  );

  const analyzer = new PriceImpactAnalyzer(pair);

  test("generateImpactTable returns rows with correct values", () => {
    const sizes = [
      1_000n * 10n ** 6n, // 1,000 USDC
      10_000n * 10n ** 6n, // 10,000 USDC
    ];

    const rows = analyzer.generateImpactTable("USDC", sizes);

    expect(rows.length).toBe(sizes.length);

    for (let i = 0; i < sizes.length; i++) {
      const amountIn = sizes[i];
      const row = rows[i];

      // amounts
      expect(row.amountIn).toBe(amountIn / 10n ** 6n);

      expect(row.amountOut).toBe(pair.getAmountOut(amountIn, USDCToken));

      // prices (numeric equality)
      expect(row.spotPrice).toBe(pair.getSpotPrice(USDCToken));
      expect(row.executionPrice).toBe(
        pair.getExecutionPrice(amountIn, USDCToken),
      );
      expect(row.priceImpactPct).toBe(pair.getPriceImpact(amountIn, USDCToken));
    }
  });

  test("findMaxSizeForImpact returns a trade with impact <= threshold", () => {
    const maxImpactPct = 1; // 1%
    const maxSize = analyzer.findMaxSizeForImpact(USDCToken, maxImpactPct);

    // Impact at returned size must be <= threshold
    const impactAtMax = pair.getPriceImpact(maxSize, USDCToken);
    expect(impactAtMax).toBeLessThanOrEqual(maxImpactPct);

    // If there is room to increase the size, the next increment should exceed the threshold
    if (maxSize < pair.reserve1) {
      const impactNext = pair.getPriceImpact(maxSize + 1n, USDCToken);
      expect(impactNext).toBeGreaterThanOrEqual(maxImpactPct);
    }
  });

  test("estimateTrueCost accounts for gas and returns reasonable metrics", () => {
    const amountIn = 5_000n * 10n ** 6n; // 5k USDC
    const gasPriceGwei = 50; // gwei

    const result = analyzer.estimateTrueCost(amountIn, USDCToken, gasPriceGwei);

    expect(result.grossOutput).toBeTypeOf("bigint");
    expect(result.gasCostEth).toBeGreaterThan(0);
    expect(result.gasCostInOutputToken).toBeGreaterThanOrEqual(0);

    // netOutput should be strictly less than gross output (converted to token units) when gas > 0
    const grossOutputTokenUnits =
      Number(result.grossOutput) /
      Number(
        pair.token0.equals(USDCToken)
          ? pair.token0.decimals
          : pair.token1.decimals,
      );
    expect(result.netOutput).toBeLessThanOrEqual(grossOutputTokenUnits);

    expect(result.effectivePrice).toBeGreaterThan(0);
  });
});
