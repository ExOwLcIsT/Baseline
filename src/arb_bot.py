# bot/arb_bot.py

import asyncio
import logging
import os
from decimal import Decimal

from dotenv import load_dotenv

from chain.chain_client import ChainClient
from core.base_types import Address
from exchange.exchange_client import ExchangeClient
from executor.engine import Executor, ExecutorConfig, ExecutorState
from inventory.tracker import InventoryTracker, Venue
from pricing.pricing_engine import PricingEngine
from strategy.fees import FeeStructure
from strategy.generator import SignalGenerator
from strategy.scorer import SignalScorer

BINANCE_CONFIG = {
    "apiKey": os.getenv("BINANCE_API_KEY"),
    "secret": os.getenv("BINANCE_SECRET"),
}


class ArbBot:
    def __init__(
        self,
        exchange: ExchangeClient,
        inventory: InventoryTracker,
        scorer: SignalScorer,
        executor: Executor,
        fees: FeeStructure,
        generator: SignalGenerator,
        pairs: list[str],
        trade_size: Decimal,
    ):
        self.exchange = exchange
        self.inventory = inventory
        self.scorer = scorer
        self.executor = executor
        self.fees = fees
        self.generator = generator
        self.pairs = pairs
        self.trade_size = trade_size
        self.running = False

    @classmethod
    async def create(cls, config: dict) -> "ArbBot":
        exchange = await ExchangeClient.from_config(BINANCE_CONFIG)
        inventory = InventoryTracker()
        fees = FeeStructure()

        sender = Address.from_string(os.environ["WALLET_ADDRESS"])
        chain_client = ChainClient(os.environ["INFURA_RPC_URL"])
        pricing_engine = PricingEngine(
            chain_client,
            os.environ["CHAIN_URL"],
            os.environ["INFURA_WS_RPC"],
            sender,
        )

        pair_addresses = [
            Address.from_string(a)
            for a in os.environ["UNISWAP_PAIR_ADDRESSES"].split()
        ]
        await pricing_engine.load_pools(pair_addresses)

        generator = SignalGenerator(
            exchange,
            pricing_engine,
            inventory,
            fees,
            config.get("signal_config", {}),
        )
        scorer = SignalScorer()

        exec_config = ExecutorConfig(
            simulation_mode=config.get("simulation", True)
        )
        executor = Executor(exchange, pricing_engine, inventory, exec_config)

        pairs = config.get("pairs")
        trade_size = Decimal(str(config.get("trade_size")))

        return cls(exchange, inventory, scorer, executor, fees, generator, pairs, trade_size)

    async def run(self):
        self.running = True
        logging.info("Bot starting...")
        await self.sync_balances()

        while self.running:
            try:
                await self.tick()
                await asyncio.sleep(1)
            except Exception as e:
                logging.error(f"Tick error: {e}")
                await asyncio.sleep(5)

    async def tick(self):
        if self.executor.circuit_breaker.is_open():
            logging.info("Circuit breaker is open")
            return

        await asyncio.gather(*[self._process_pair(pair) for pair in self.pairs])

    async def _process_pair(self, pair: str):
        signal = await self.generator.generate(pair, self.trade_size)
        if signal is None:
            return

        signal.score = self.scorer.score(signal, self.inventory.all_skews())
        if signal.score < 60:
            return

        logging.info(
            f"Signal: {pair} spread={round(float(signal.spread_bps), 2)}bps "
            f"score={signal.score}"
        )

        ctx = await self.executor.execute(signal)

        self.scorer.record_result(pair, ctx.state == ExecutorState.DONE)

        if ctx.state == ExecutorState.DONE:
            logging.info(f"SUCCESS: PnL={round(ctx.actual_net_pnl, 4)}")
        else:
            logging.warning(f"FAILED: {ctx.error}")

        await self.sync_balances()

    async def sync_balances(self):
        balances = await self.exchange.fetch_balance()
        self.inventory.update_from_cex(Venue.BINANCE, balances)
        # TODO: replace with real on-chain wallet query
        self.inventory.update_from_wallet(Venue.WALLET, {
            "ETH":  Decimal("20"),
            "USDT": Decimal("100000"),
        })

    def stop(self):
        self.running = False


async def main():
    load_dotenv()
    pairs = os.getenv("TOKEN_PAIRS").split(" ")

    config = {
        "pairs":        pairs,
        "trade_size":   0.1,
        "simulation":   True,
        "signal_config": {},
    }
    bot = await ArbBot.create(config)
    await bot.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
