# integration/arb_checker.py

import asyncio
import os
import sys
from datetime import datetime
from decimal import Decimal

from dotenv import load_dotenv

from chain.chain_client import ChainClient
from configs.config import BINANCE_CONFIG
from exchange.exchange_client import ExchangeClient
from exchange.order_book_analyzer import OrderBookAnalyzer
from inventory.pnl import PnLEngine
from inventory.tracker import InventoryTracker, Venue
from pricing.AMM import UniswapV2Pair
from pricing.pricing_engine import PricingEngine
from core.base_types import Address


class ArbChecker:
    """
    End-to-end arbitrage check: detect → validate → check inventory.
    Does NOT execute — just identifies opportunities.
    """

    def __init__(
        self,
        pricing_engine: PricingEngine,
        exchange_client: ExchangeClient,
        inventory_tracker: InventoryTracker,
        pnl_engine: PnLEngine,
    ):
        self.pricing_engine = pricing_engine
        self.exchange_client = exchange_client
        self.inventory_tracker = inventory_tracker
        self.pnl_engine = pnl_engine

    async def check(self, pair: str, size: float) -> dict:
        """
        Full arb check for a trading pair.

        Flow:
        1. Get DEX price from pricing_engine
        2. Get CEX order book from exchange_client
        3. Compare prices, calculate gap
        4. Estimate all costs (fees, gas, slippage)
        5. Check inventory availability
        6. Return opportunity assessment

        Returns:
        {
            'pair':                   str,
            'timestamp':              datetime,
            'dex_price':              Decimal,
            'cex_bid':                Decimal,
            'cex_ask':                Decimal,
            'gap_bps':                Decimal,
            'direction':              'buy_dex_sell_cex' | 'buy_cex_sell_dex' | None,
            'estimated_costs_bps':    Decimal,
            'estimated_net_pnl_bps':  Decimal,
            'inventory_ok':           bool,
            'executable':             bool,
            'details': {
                'dex_price_impact_bps': Decimal,
                'cex_slippage_bps':     Decimal,
                'cex_fee_bps':          Decimal,
                'dex_fee_bps':          Decimal,
                'gas_cost_usd':         Decimal,
                'gas_bps':              Decimal,
            },
        }
        """
        POOL_ADDRESS = Address.from_string("0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852")

        await self.pricing_engine.load_pools([POOL_ADDRESS])
        uni_pair = await UniswapV2Pair.from_chain(
            POOL_ADDRESS, self.pricing_engine.client
        )
        eth_token = (
            uni_pair.token0 if uni_pair.token0.name == "WETH" else uni_pair.token1
        )
        usdt_token = (
            uni_pair.token0 if uni_pair.token0.name == "USDT" else uni_pair.token1
        )

        size_int = int(size * eth_token.decimals)

        dex_sell_price_usd = (
            Decimal(str(uni_pair.get_amount_out(size_int, eth_token)))
            / Decimal(str(usdt_token.decimals))
            / Decimal(str(size))
        )
        dex_buy_price_raw = uni_pair.get_amount_in(size_int, eth_token)
        dex_buy_price_usd = (
            Decimal(str(dex_buy_price_raw))
            / Decimal(str(usdt_token.decimals))
            / Decimal(str(size))
        )

        dex_quote = self.pricing_engine.get_quote(eth_token, usdt_token, size_int, 0)

        dex_gas = Decimal(
            str(uni_pair.get_amount_out(dex_quote.gas_estimate * 10**9, eth_token))
        ) / Decimal(str(usdt_token.decimals))

        book = self.exchange_client.fetch_order_book_rest(pair)

        if not book:
            raise RuntimeError("Order book unavailable")

        analyzer = OrderBookAnalyzer(book)
        buy_walked = analyzer.walk_the_book("buy", Decimal(str(size)))
        sell_walked = analyzer.walk_the_book("sell", Decimal(str(size)))

        gap1 = dex_sell_price_usd - buy_walked["avg_price"]  # buy CEX, sell DEX
        gap2 = sell_walked["avg_price"] - dex_buy_price_usd  # buy DEX, sell CEX

        if gap1 > gap2:
            gap_bps = gap1 / buy_walked["avg_price"] * Decimal("10000")
            cex_slippage_bps = buy_walked["slippage_bps"]
            dex_price_impact = Decimal(
                str(uni_pair.get_price_impact(size_int, eth_token) / 100)
            )
            gas_bps = dex_gas / dex_sell_price_usd * Decimal("10000")
            inventory_ok = self.inventory_tracker.get_available(
                Venue.BINANCE, "USDT"
            ) >= buy_walked["total_cost"] and self.inventory_tracker.get_available(
                Venue.WALLET, "ETH"
            ) >= Decimal(
                str(size)
            )
        else:
            gap_bps = gap2 / dex_buy_price_usd * Decimal("10000")
            cex_slippage_bps = sell_walked["slippage_bps"]
            dex_price_impact = Decimal(
                str(uni_pair.get_price_impact(dex_buy_price_raw, usdt_token) / 100)
            )
            gas_bps = dex_gas / dex_buy_price_usd * Decimal("10000")
            inventory_ok = self.inventory_tracker.get_available(
                Venue.WALLET, "USDT"
            ) >= Decimal(
                str(dex_buy_price_raw)
            ) and self.inventory_tracker.get_available(
                Venue.BINANCE, "ETH"
            ) >= Decimal(
                str(size)
            )

        CEX_FEE_BPS = Decimal("10")
        DEX_FEE_BPS = Decimal("30")
        estimated_costs_bps = (
            dex_price_impact + cex_slippage_bps + CEX_FEE_BPS + DEX_FEE_BPS + gas_bps
        )

        if gap_bps < estimated_costs_bps:
            direction = None
        elif gap1 > gap2:
            direction = "buy_cex_sell_dex"
        else:
            direction = "buy_dex_sell_cex"

        dex_price = (
            dex_sell_price_usd if direction == "buy_cex_sell_dex" else dex_buy_price_usd
        )
        executable = gap_bps > estimated_costs_bps and inventory_ok

        return {
            "pair": pair,
            "timestamp": datetime.now(),
            "dex_price": dex_price,
            "cex_bid": sell_walked["avg_price"],
            "cex_ask": buy_walked["avg_price"],
            "gap_bps": gap_bps,
            "direction": direction,
            "estimated_costs_bps": estimated_costs_bps,
            "estimated_net_pnl_bps": gap_bps - estimated_costs_bps,
            "inventory_ok": inventory_ok,
            "executable": executable,
            "details": {
                "dex_price_impact_bps": dex_price_impact,
                "cex_slippage_bps": cex_slippage_bps,
                "cex_fee_bps": CEX_FEE_BPS,
                "dex_fee_bps": DEX_FEE_BPS,
                "gas_cost_usd": dex_gas,
                "gas_bps": gas_bps,
            },
        }


# ------------------------------------------------------------------ #
#  CLI entrypoint                                                      #
# ------------------------------------------------------------------ #


def parse_arg(flag: str) -> str | None:
    prefix = flag + "="
    arg = next((a for a in sys.argv if a.startswith(prefix)), None)
    return arg.split("=")[1] if arg else None


async def main():
    load_dotenv()
    size = float(parse_arg("--size") or 1.0)

    chain_client = ChainClient("http://127.0.0.1:8545")

    pricing_engine = PricingEngine(
        chain_client, "http://127.0.0.1:8545", os.environ["INFURA_WS_RPC"]
    )
    exchange_client = ExchangeClient(BINANCE_CONFIG)
    inventory_tracker = InventoryTracker()
    pnl_engine = PnLEngine()
    arb_checker = ArbChecker(
        pricing_engine, exchange_client, inventory_tracker, pnl_engine
    )

    checked = await arb_checker.check("ETH/USDT", size)

    if checked["direction"] is None:
        print("No profitable price gap found")
        return

    print("═" * 65)
    print(f"ARB CHECK: ETH/USDT (size: {size} ETH)")
    print("═" * 65)
    print("Prices:")

    if checked["direction"] == "buy_cex_sell_dex":
        print(f"   Binance ask:   ${checked['cex_ask']:.2f} (buy {size} ETH)")
        print(f"   Uniswap V2:    ${checked['dex_price']:.2f}")
        print(
            f"Gap: ${checked['dex_price'] - checked['cex_ask']:.2f} ({checked['gap_bps']:.2f} bps)"
        )
    else:
        print(f"   Uniswap V2:    ${checked['dex_price']:.2f} (buy {size} ETH)")
        print(f"   Binance bid:   ${checked['cex_bid']:.2f}")
        print(
            f"Gap: ${checked['cex_bid'] - checked['dex_price']:.2f} ({checked['gap_bps']:.2f} bps)"
        )

    d = checked["details"]
    print("Costs:")
    print(f"  DEX fee:           {d['dex_fee_bps']} bps")
    print(f"  DEX price impact:  {d['dex_price_impact_bps']} bps")
    print(f"  CEX fee:           {d['cex_fee_bps']} bps")
    print(f"  CEX slippage:      {d['cex_slippage_bps']} bps")
    print(f"  Gas:               ${d['gas_cost_usd']:.4f} ({d['gas_bps']:.2f} bps)")
    print("─" * 65)
    print(f"  Total costs:       {checked['estimated_costs_bps']:.2f} bps")

    net = checked["estimated_net_pnl_bps"]
    print(
        f"Net PnL estimate: {net:.2f} bps {'✅ Profitable' if net > 0 else '❌ NOT PROFITABLE'}"
    )

    print("Inventory:")
    if checked["direction"] == "buy_dex_sell_cex":
        wallet_usdt = arb_checker.inventory_tracker.get_available(Venue.WALLET, "USDT")
        binance_eth = arb_checker.inventory_tracker.get_available(Venue.BINANCE, "ETH")
        need_usdt = checked["dex_price"] * Decimal(str(size))
        print(
            f"  Wallet USDT:   {wallet_usdt} (need ~{need_usdt:.2f}) {'✅' if wallet_usdt >= need_usdt else '❌'}"
        )
        print(
            f"  Binance ETH:   {binance_eth} (need {size}) {'✅' if binance_eth >= Decimal(str(size)) else '❌'}"
        )
    else:
        binance_usdt = arb_checker.inventory_tracker.get_available(
            Venue.BINANCE, "USDT"
        )
        wallet_eth = arb_checker.inventory_tracker.get_available(Venue.WALLET, "ETH")
        need_usdt = checked["cex_ask"] * Decimal(str(size))
        print(
            f"  Binance USDT:  {binance_usdt} (need ~{need_usdt:.2f}) {'✅' if binance_usdt >= need_usdt else '❌'}"
        )
        print(
            f"  Wallet ETH:    {wallet_eth} (need {size}) {'✅' if wallet_eth >= Decimal(str(size)) else '❌'}"
        )

    print(f"Verdict: {'✅ Execute' if checked['executable'] else '❌ SKIP'}")
    print("═" * 65)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(err)
