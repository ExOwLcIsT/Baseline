import { Address } from "../core/BaseTypes/Address.js";
import Route from "./Route.js";
import Token from "./Token.js";
class RouteFinder {
    // Finds optimal routes between tokens.
    pools;
    // token.name -> neighbors
    graph;
    get tokens() {
        const routerTokens = new Set();
        this.pools.forEach((pool) => {
            routerTokens.add(pool.token0);
            routerTokens.add(pool.token1);
        });
        return [...routerTokens];
    }
    constructor(pools) {
        this.pools = pools;
        this.graph = this.buildGraph();
    }
    buildGraph() {
        const g = new Map();
        for (const p of this.pools) {
            if (!g.has(p.token0.name))
                g.set(p.token0.name, []);
            if (!g.has(p.token1.name))
                g.set(p.token1.name, []);
            g.get(p.token0.name).push({ pool: p, token: p.token1 });
            g.get(p.token1.name).push({ pool: p, token: p.token0 });
        }
        return g;
    }
    findAllRoutes(tokenIn, tokenOut, maxHops = 3) {
        /*
            Find all possible routes up to max_hops.
            */
        const routes = [];
        const dfs = (current, visited, poolsPath, tokensPath, hopsLeft) => {
            if (hopsLeft < 0)
                return;
            if (current.equals(tokenOut)) {
                routes.push(new Route([...poolsPath], [...tokensPath]));
                return;
            }
            const neighbors = this.graph.get(current.name);
            if (!neighbors)
                return;
            for (const { pool, token } of neighbors) {
                if (visited.has(token.name))
                    continue;
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
    convertToOutputToken(gasWei, tokenOut) {
        if (tokenOut.address.checksum === "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")
            return gasWei;
        const ethToken = new Token("WETH", 10n ** 18n, Address.fromString("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"));
        const routes = this.findAllRoutes(ethToken, tokenOut, 5);
        let minGas = routes[0].getOutput(gasWei);
        for (let i = 1; i < routes.length; i++) {
            const out = routes[i].getOutput(gasWei);
            if (out < minGas) {
                minGas = out;
            }
        }
        // simulate swap of gasWei WETH → tokenOut
        return minGas;
    }
    findBestRoute(tokenIn, tokenOut, amountIn, gasPriceGwei, maxHops = 3) {
        /*
            Find route that maximizes NET output (after gas).
            Returns (best_route, net_output).
            */
        const routes = this.findAllRoutes(tokenIn, tokenOut, maxHops);
        let bestRoute = undefined;
        let bestNetOutput = 0n;
        routes.forEach((route) => {
            const grossOutput = route.getOutput(amountIn);
            const gasCost = route.estimateGas() * gasPriceGwei * BigInt(1000000000);
            const gasCostInOutputToken = this.convertToOutputToken(gasCost, tokenOut);
            const netOutput = grossOutput - gasCostInOutputToken;
            if (netOutput > bestNetOutput) {
                bestNetOutput = netOutput;
                bestRoute = route;
            }
        });
        return [bestRoute, bestNetOutput];
    }
    compareRoutes(tokenIn, tokenOut, amountIn, gasPriceGwei) {
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
            const gasCostWei = gasEstimate * gasPriceGwei * 1000000000n;
            const gasCostInOutputToken = this.convertToOutputToken(gasCostWei, tokenOut);
            const net = gross - gasCostInOutputToken;
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
