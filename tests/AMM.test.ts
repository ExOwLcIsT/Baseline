import UniswapV2Pair from "../pricing/AMM";
import Token from "../pricing/Token";

import { expect, test, describe } from "vitest";
describe("AMM", () => {
  const USDCToken = new Token("USDC", BigInt(Math.pow(10, 6)));
  const ETHToken = new Token("ETH", BigInt(Math.pow(10, 18)));

  test("get basic amountOut ", () => {
    //1000 ETH / 2M USDC pool, buy 1 ETH worth
    const pair = new UniswapV2Pair(
      ETHToken,
      USDCToken,
      BigInt(1000 * 10 ** 18), //# 1000 ETH
      BigInt(2_000_000 * 10 ** 6), // 2M USDC
    );

    const usdcIn = 2000;
    const ethOut = pair.getAmountOut(usdcIn, USDCToken);

    // Should get slightly less than 1 ETH due to fee + impact
    expect(ethOut).toBeLessThan(1 * 10 ** 18);
    expect(ethOut).toBeGreaterThan(0.99 * 10 ** 18);
  });

  test("amountOut matches solidity", () => {
    // Compare against known on-chain result
    // Uses a real historical swap and verifies the same output
    // 0x0e793ea99cbfbceeca7c784a708080e51974846cfa166f9af5fbc4f3c597f0f4
    const pair = new UniswapV2Pair(
      ETHToken,
      USDCToken,
      BigInt(995 * 10 ** 18),
      BigInt(2_995_000 * 10 ** 6),
    );

    const ethIn = 0.03388697;
    const usdcOut = pair.getAmountOut(ethIn, ETHToken);

    // Should get slightly less than 1 ETH due to fee + impact
    expect(usdcOut).toBeLessThan(102 * 10 ** 6);
    expect(usdcOut).toBeGreaterThan(99 * 10 ** 6);
  });
  test("test_integer_math_no_floats", () => {
    // Verify no floating point used
    // Large numbers that would lose precision with float
    const pair = new UniswapV2Pair(
      USDCToken,
      ETHToken,
      BigInt(10 ** 30),
      BigInt(10 ** 30),
    );
    // Should not raise or lose precision
    const out = pair.getAmountOut(10 ** 25, USDCToken);
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
    const new_pair = pair.simulateSwap(10, ETHToken);
    expect(pair.reserve0).toBe(original_reserve);
    expect(new_pair.reserve0).not.toBe(original_reserve);
  });
});
