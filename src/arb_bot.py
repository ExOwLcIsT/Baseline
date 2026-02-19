# bot/arb_bot.py

import asyncio
import logging
import os
from decimal import Decimal

from dotenv import load_dotenv

from chain.chain_client import ChainClient
from configs.config import BINANCE_CONFIG
from core.base_types import Address
from exchange.exchange_client import ExchangeClient
from executor.engine import Executor, ExecutorConfig, ExecutorState
from executor.risk_limits import RiskLimits
from executor.risk_manager import RiskManager
from inventory.tracker import InventoryTracker, Venue
from pricing.pricing_engine import PricingEngine
from src.kill_switch import is_kill_switch_active
from strategy.fees import FeeStructure
from strategy.generator import SignalGenerator
from strategy.scorer import SignalScorer


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
        dex_pairs: list[str],
        trade_size: Decimal,
        chain_client: ChainClient,
    ):
        self.exchange = exchange
        self.inventory = inventory
        self.scorer = scorer
        self.executor = executor
        self.fees = fees
        self.generator = generator
        self.pairs = pairs
        self.dex_pairs = dex_pairs
        self.trade_size = trade_size
        self.running = False
        self.client = chain_client

        self.risk_limits = RiskLimits()
        self.risk_manager = RiskManager(
            self.risk_limits, initial_capital=100.0)

    @classmethod
    async def create(cls, config: dict) -> "ArbBot":
        exchange = ExchangeClient(BINANCE_CONFIG)
        await exchange.start()
        inventory = InventoryTracker()
        fees = FeeStructure()

        chain_client = ChainClient(os.environ["INFURA_RPC_URL"])
        pricing_engine = PricingEngine(
            chain_client, os.environ["CHAIN_URL"], os.environ["INFURA_WS_RPC"]
        )

        pair_addresses = [
            Address.from_string(a) for a in os.environ["UNISWAP_PAIR_ADDRESSES"].split()
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
            simulation_mode=config.get("simulation", True))
        executor = Executor(exchange, pricing_engine, inventory, exec_config)

        pairs = config.get("pairs")
        dex_pairs = config.get("dex_pairs")
        trade_size = Decimal(str(config.get("trade_size")))

        return cls(
            exchange,
            inventory,
            scorer,
            executor,
            fees,
            generator,
            pairs,
            dex_pairs,
            trade_size,
            chain_client,
        )

    async def run(self):
        self.running = True
        logging.info("Bot starting...")
        await self.sync_balances()

        while self.running:
            # try:
                await self.tick()
                await asyncio.sleep(1)
            # except Exception as e:
            #     logging.error(f"Tick error: {e}")
            #     await asyncio.sleep(5)

    async def tick(self):
        if is_kill_switch_active():
            logging.critical("KILL SWITCH ACTIVE")
            self.stop()
            return

        if self.executor.circuit_breaker.is_open():
            logging.info("Circuit breaker is open")
            return

        await asyncio.gather(
            *[
                self._process_pair(self.pairs[i], self.dex_pairs[i])
                for i in range(len(self.pairs))
            ]
        )

    async def _process_pair(self, cex_pair: str, dex_pair: str):
        signal = await self.generator.generate(cex_pair, dex_pair, self.trade_size)
        if signal is None:
            return

        signal.score = self.scorer.score(signal, self.inventory.all_skews())

        if signal.score < 60:
            return

        allowed, reason = self.risk_manager.check_pre_trade(signal)

        if not allowed:
            logging.warning(f"Risk check failed:{reason}")
            return

        logging.info(
            f"Signal: {cex_pair} spread={round(float(signal.spread_bps), 2)}bps "
            f"score={signal.score}"
        )
        return
        ctx = await self.executor.execute(signal)

        self.scorer.record_result(cex_pair, ctx.state == ExecutorState.DONE)

        if ctx.state == ExecutorState.DONE:
            logging.info(f"SUCCESS: PnL={round(ctx.actual_net_pnl, 4)}")
        else:
            logging.warning(f"FAILED: {ctx.error}")

        await self.sync_balances()

    async def sync_balances(self):
        balances = self.exchange.fetch_balance()
        self.inventory.update_from_cex(Venue.BINANCE, balances)
        wallet = os.getenv("WALLET_ADDRESS")
        wallet_balances: dict = self.client.get_balances(wallet)
        self.inventory.update_from_wallet(Venue.WALLET, wallet_balances)

    def stop(self):
        self.running = False


async def main():
    load_dotenv()
    pairs = os.getenv("TOKEN_PAIRS").split(" ")
    dex_pairs = os.getenv("DEX_TOKEN_PAIRS").split(" ")

    config = {
        "pairs": pairs,
        "dex_pairs": dex_pairs,
        "trade_size": 0.01,
        "simulation": True,
        "signal_config": {},
    }
    bot = await ArbBot.create(config)
    await bot.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
