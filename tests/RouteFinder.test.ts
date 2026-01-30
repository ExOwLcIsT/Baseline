import UniswapV2Pair from "../pricing/AMM";
import Token from "../pricing/Token";
import RouteFinder from "../pricing/RouteFinder";
import { describe, test, beforeEach, expect } from "vitest";
const ONE = 10n ** 18n;

function t(name: string) {
  return new Token(name, ONE);
}

function pool(a: Token, b: Token, rA: number, rB: number) {
  return new UniswapV2Pair(a, b, BigInt(rA) * ONE, BigInt(rB) * ONE);
}

describe("RouteFinder", () => {
  let SHIB: Token;
  let ETH: Token;
  let USDC: Token;

  beforeEach(() => {
    SHIB = t("SHIB");
    ETH = t("ETH");
    USDC = t("USDC");
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

    const [best] = finder.findBestRoute(SHIB, USDC, 1000, BigInt(1));

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

    const [best] = finder.findBestRoute(SHIB, USDC, 1000, BigInt(3000));

    expect(best).not.toBeNull();
    expect(best).not.toBeUndefined();
    expect(best!.hops).toBe(1);
  });

  test("no route exists", () => {
    //Handles disconnected tokens gracefully
    const DAI = t("DAI");

    const pools = [pool(SHIB, ETH, 1000, 1000)];

    const finder = new RouteFinder(pools);

    const routes = finder.findAllRoutes(SHIB, DAI);

    expect(routes.length).toBe(0);

    const [best] = finder.findBestRoute(SHIB, DAI, 100, BigInt(10));

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

    const amountIn = 1000;

    const routeOut = route.getOutput(amountIn);
    const out1 = p1.getAmountOut(amountIn, SHIB);
    const out2 = p2.getAmountOut(Number(out1) / Number(ETH.decimals), ETH);

    expect(routeOut).toEqual(out2);
  });
});

//996006981039903172n

//996006981039903172n
//1984067703346028427339n

//1984067703346028427339n
