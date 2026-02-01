import UniswapV2Pair from "../pricing/AMM";
import Token from "../pricing/Token";
import RouteFinder from "../pricing/RouteFinder";
import { describe, test, beforeEach, expect } from "vitest";
import { Address } from "../core/BaseTypes/Address";
const ONE = 10n ** 18n;

function pool(a: Token, b: Token, rA: number, rB: number) {
  return new UniswapV2Pair(a, b, BigInt(rA) * ONE, BigInt(rB) * ONE);
}

describe("RouteFinder", () => {
  let SHIB: Token;
  let ETH: Token;
  let USDC: Token;

  beforeEach(() => {
    SHIB = new Token("SHIB", 10n**18n, Address.fromString("0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE"));
    ETH = new Token(
      "ETH",
      10n ** 18n,
      Address.fromString("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
    );
    USDC = new Token(
      "USDC",
      10n ** 18n,
      Address.fromString("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    );
  });

  test("direct vs multihop", () => {
    //Sometimes multi-hop is better despite gas
    //Setup pools where SHIB→ETH→USDC beats SHIB→USDC

    const pools = [
      pool(SHIB, USDC, 1_000_000, 355_000),
      pool(SHIB, ETH, 1_000_000, 1_200),
      pool(ETH, USDC, 1_000, 300_000),
    ];

    const finder = new RouteFinder(pools);

    const [best] = finder.findBestRoute(SHIB, USDC, 1000n * SHIB.decimals, 1n);

    expect(best).not.toBeNull();
    expect(best).not.toBeUndefined();
    expect(best!.hops).toBe(2);
  });

  test("gas makes direct better", () => {
    //At high gas prices, fewer hops win
    //Same pools, but high gas price flips the winner
    const pools = [
      pool(SHIB, USDC, 1_000_000, 355_000),
      pool(SHIB, ETH, 1_000_000, 1_200),
      pool(ETH, USDC, 1_000, 300_000),
    ];

    const finder = new RouteFinder(pools);

    const [best] = finder.findBestRoute(
      SHIB,
      USDC,
      1000n * SHIB.decimals,
      3000n,
    );

    expect(best).not.toBeNull();
    expect(best).not.toBeUndefined();
    expect(best!.hops).toBe(1);
  });

  test("no route exists", () => {
    //Handles disconnected tokens gracefully
    const DAI = new Token(
      "DAI",
      10n ** 6n,
      Address.fromString("0x6B175474E89094C44Da98b954EedeAC495271d0F"),
    );

    const pools = [pool(SHIB, ETH, 1000, 1000)];

    const finder = new RouteFinder(pools);

    const routes = finder.findAllRoutes(SHIB, DAI);

    expect(routes.length).toBe(0);

    const [best] = finder.findBestRoute(
      SHIB,
      DAI,
      100n * SHIB.decimals,
      BigInt(10),
    );

    expect(best).toBeUndefined();
  });

  test("route output matches sequential swaps", () => {
    //Route simulation equals doing swaps one by one
    const p1 = pool(SHIB, ETH, 100_000, 1_000);
    const p2 = pool(ETH, USDC, 1_000, 20_000);

    const finder = new RouteFinder([p1, p2]);

    const routes = finder.findAllRoutes(SHIB, USDC);

    expect(routes.length).toBe(1);

    const route = routes[0];

    const amountIn = 1000n * SHIB.decimals;

    const routeOut = route.getOutput(amountIn);
    const out1 = p1.getAmountOut(amountIn, SHIB);
    const out2 = p2.getAmountOut(out1, ETH);

    expect(routeOut).toEqual(out2);
  });
});
