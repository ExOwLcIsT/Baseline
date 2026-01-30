import UniswapV2Pair from "./AMM.js";
import Route from "./Route.js";
import Token from "./Token.js";

class RouteFinder {
  // Finds optimal routes between tokens.
  pools: UniswapV2Pair[];

  // token.name -> neighbors
  graph: Map<string, Array<{ pool: UniswapV2Pair; token: Token }>>;

  constructor(pools: UniswapV2Pair[]) {
    this.pools = pools;
    this.graph = this.buildGraph();
  }

  buildGraph(): Map<string, Array<{ pool: UniswapV2Pair; token: Token }>> {
    const g = new Map<string, Array<{ pool: UniswapV2Pair; token: Token }>>();

    for (const p of this.pools) {
      if (!g.has(p.token0.name)) g.set(p.token0.name, []);
      if (!g.has(p.token1.name)) g.set(p.token1.name, []);

      g.get(p.token0.name)!.push({ pool: p, token: p.token1 });
      g.get(p.token1.name)!.push({ pool: p, token: p.token0 });
    }

    return g;
  }

  findAllRoutes(tokenIn: Token, tokenOut: Token, maxHops: number = 3): Route[] {
    /*
        Find all possible routes up to max_hops.
        */
    const routes: Route[] = [];

    const dfs = (
      current: Token,
      visited: Set<string>,
      poolsPath: UniswapV2Pair[],
      tokensPath: Token[],
      hopsLeft: number,
    ) => {
      if (hopsLeft < 0) return;

      if (current.equals(tokenOut)) {
        routes.push(new Route([...poolsPath], [...tokensPath]));
        return;
      }

      const neighbors = this.graph.get(current.name);
      if (!neighbors) return;

      for (const { pool, token } of neighbors) {
        if (visited.has(token.name)) continue;

        visited.add(token.name);

        poolsPath.push(pool);
        tokensPath.push(token);

        dfs(token, visited, poolsPath, tokensPath, hopsLeft - 1);

        poolsPath.pop();
        tokensPath.pop();

        visited.delete(token.name);
      }
    };

    dfs(tokenIn, new Set([tokenIn.name]), [], [tokenIn], maxHops);

    return routes;
  }
  convertToOutputToken(gasWei: bigint, tokenOut: Token): bigint {
    if (tokenOut.name === "ETH") return gasWei;

    const pool = this.pools.find(
      (p) =>
        (p.token0.name === "ETH" && p.token1.equals(tokenOut)) ||
        (p.token1.name === "ETH" && p.token0.equals(tokenOut)),
    );

    if (!pool) {
      throw new Error("No ETH→tokenOut pool for gas conversion");
    }

    const ethToken = new Token("ETH", 10n ** 18n);

    // simulate swap of gasWei ETH → tokenOut
    return pool.getAmountOut(
      Number(gasWei) / Number(ethToken.decimals),
      ethToken,
    );
  }
  findBestRoute(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: number,
    gasPriceGwei: bigint,
    maxHops: number = 3,
  ): [Route, bigint] {
    /*
        Find route that maximizes NET output (after gas).
        Returns (best_route, net_output).
        */
    const routes = this.findAllRoutes(tokenIn, tokenOut, maxHops);

    let bestRoute: Route | undefined = undefined;
    let bestNetOutput = BigInt(0);

    routes.forEach((route) => {
      const grossOutput = route.getOutput(amountIn);
      const gasCost = route.estimateGas() * gasPriceGwei * BigInt(1000000000);
      const gasCostInOutputToken = this.convertToOutputToken(gasCost, tokenOut);
      const netOutput = grossOutput - gasCostInOutputToken;
      console.log(route);
      console.log(grossOutput - gasCostInOutputToken);
      if (netOutput > bestNetOutput) {
        bestNetOutput = netOutput;
        bestRoute = route;
      }
    });
    return [bestRoute!, bestNetOutput];
  }

  compareRoutes(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: number,
    gasPriceGwei: bigint,
  ) {
    /*
        Compare all routes with detailed breakdown:
        {
            'route': Route,
            'grossOutput': int,
            'gasEstimate': int,
            'gasCost': int,
            'netOutput': int,
        }
        */
    const routes = this.findAllRoutes(tokenIn, tokenOut);

    const results = [];

    for (const route of routes) {
      const gross = route.getOutput(amountIn);
      const gasEstimate = route.estimateGas();
      const gasCostWei = gasEstimate * gasPriceGwei * 1_000_000_000n;

      const net = gross - gasCostWei;

      results.push({
        route,
        gross_output: gross,
        gas_estimate: gasEstimate,
        gas_cost: gasCostWei,
        net_output: net,
      });
    }

    return results.sort((a, b) => (a.net_output > b.net_output ? -1 : 1));
  }
}

export default RouteFinder;
