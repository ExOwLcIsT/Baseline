import { Address } from "../core/BaseTypes/Address";
import UniswapV2Pair from "../pricing/AMM";
import Token from "../pricing/Token";

import { expect, test, describe } from "vitest";
describe("AMM", () => {
  const USDCToken = new Token(
    "USDC",
    10n ** 6n,
    Address.fromString("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
  );
  const ETHToken = new Token(
    "ETH",
    10n ** 18n,
    Address.fromString("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
  );

  test("get basic amountOut ", () => {
    //1000 ETH / 2M USDC pool, buy 1 ETH worth
    const pair = new UniswapV2Pair(
      ETHToken,
      USDCToken,
      BigInt(1000 * 10 ** 18), //# 1000 ETH
      BigInt(2_000_000 * 10 ** 6), // 2M USDC
    );

    const usdcIn = 2000n * 10n ** 6n;
    console.log("Here");
    const ethOut = pair.getAmountOut(usdcIn, USDCToken);

    // Should get slightly less than 1 ETH due to fee + impact
    expect(ethOut).toBeLessThan(1 * 10 ** 18);
    expect(ethOut).toBeGreaterThan(0.99 * 10 ** 18);
  });

  test("amountOut matches solidity", () => {
    // Compare against known on-chain result
    // Uses a real historical swap and verifies the same output
    // https://etherscan.io/tx/0xdbdc09b49eaaeb155bb8ecb6512c01f31b21f88ecc7af1205cf07bf459b44b5d
    const pair = new UniswapV2Pair(
      ETHToken,
      USDCToken,
      BigInt(3861.69752193 * 10 ** 18),
      BigInt(10561414.261179 * 10 ** 6),
    );

    const ethIn = 72903581224916300n;
    const usdcOut = pair.getAmountOut(ethIn, ETHToken);

    // Should get slightly less than 1 ETH due to fee + impact
    expect(usdcOut).toBe(198783196n);
  });
  test("test integer math no floats", () => {
    // Verify no floating point used
    // Large numbers that would lose precision with float
    const pair = new UniswapV2Pair(
      USDCToken,
      ETHToken,
      BigInt(10 ** 30),
      BigInt(10 ** 30),
    );
    // Should not raise or lose precision
    const out = pair.getAmountOut(10n ** 25n, USDCToken);
    expect(typeof out).toBe("bigint");
    expect(out > 0n).toBe(true);
  });
  test("swap is immutable", () => {
    //simulate_swap doesn't modify original
    const pair = new UniswapV2Pair(
      ETHToken,
      USDCToken,
      BigInt(1000), //# 1000 ETH
      BigInt(2_000_000), // 2M USDC
    );
    const original_reserve = pair.reserve0;
    const new_pair = pair.simulateSwap(10n * 10n ** 18n, ETHToken);
    expect(pair.reserve0).toBe(original_reserve);
    expect(new_pair.reserve0).not.toBe(original_reserve);
  });
});
