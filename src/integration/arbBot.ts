import ExchangeClient from "../../exchange/ExchangeClient.js";
import Executor, {
  ExecutorConfig,
  ExecutorState,
} from "../../executor/Engine.js";
import InventoryTracker, { Venue } from "../../inventory/Tracker.js";
import FeeStructure from "../../strategy/Fees.js";
import SignalGenerator from "../../strategy/Generator.js";
import SignalScorer from "../../strategy/Scorer.js";

import { BINANCE_CONFIG } from "../../configs/Binance_config.js";
import { Decimal } from "decimal.js";
import ChainClient from "../../chain/ChainClient.js";
import PricingEngine from "../../pricing/PricingEngine.js";
import * as dotenv from "dotenv";
import "dotenv/config";
import { Address } from "../../core/BaseTypes/Address.js";

class ArbBot {
  exchange: ExchangeClient;
  inventory: InventoryTracker;
  scorer: SignalScorer;
  executor: Executor;
  fees: FeeStructure;
  generator: SignalGenerator;
  pairs: string[];
  tradeSize: Decimal;
  running: boolean;
  private constructor(
    exchange: ExchangeClient,
    inventory: InventoryTracker,
    scorer: SignalScorer,
    executor: Executor,
    fees: FeeStructure,
    generator: SignalGenerator,
    pairs: string[],
    tradeSize: Decimal,
    running: boolean,
  ) {
    this.exchange = exchange;
    this.inventory = inventory;
    this.scorer = scorer;
    this.executor = executor;
    this.fees = fees;
    this.generator = generator;
    this.pairs = pairs;
    this.tradeSize = tradeSize;
    this.running = running;
  }
  static async create(config: {
    pairs: string[];
    simulation: boolean;
    signalConfig: {
      minSpreadBps?: number;
      minProfitUsd?: number;
      maxPositionUsd?: number;
      signalTtlSeconds?: number;
      cooldownSeconds?: number;
    };
    tradeSize: number;
  }) {
    const exchange = await ExchangeClient.fromConfig(BINANCE_CONFIG);
    const inventory = new InventoryTracker();
    const fees = new FeeStructure();

    const sender = Address.fromString(process.env.WALLET_ADDRESS!);
    const chainClient = new ChainClient(process.env.INFURA_RPC_URL);
    const pricingEngine = new PricingEngine(
      chainClient,
      process.env.CHAIN_URL!,
      process.env.INFURA_WS_RPC!,
      sender,
    );

    const pairAdresses = process.env
      .UNISWAP_PAIR_ADDRESSES!.split(" ")
      .map((a) => {
        return Address.fromString(a);
      });
    await pricingEngine.loadPools(pairAdresses);

    const generator = new SignalGenerator(
      exchange,
      pricingEngine,
      inventory,
      fees,
      config.signalConfig ?? {},
    );
    const scorer = new SignalScorer();
    const execConfig = new ExecutorConfig();
    execConfig.simulationMode = config.simulation ?? true;
    const executor = new Executor(
      exchange,
      pricingEngine,
      inventory,
      execConfig,
    );

    const pairs = config.pairs ?? ["ETH/USDT"];
    const tradeSize = config.tradeSize ?? 0.1;
    const running = false;
    return new ArbBot(
      exchange,
      inventory,
      scorer,
      executor,
      fees,
      generator,
      pairs,
      Decimal(tradeSize),
      running,
    );
  }
  async run() {
    this.running = true;
    console.log("Bot starting...");
    await this.syncBalances();

    while (this.running) {
      try {
        await this.tick();
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Tick error: ${err}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
  async tick() {
    if (this.executor.circuitBreaker.isOpen()) {
      console.log("Circuit breaker is open");
      return;
    }

    this.pairs.forEach(async (pair) => {
      const signal = await this.generator.generate(pair, this.tradeSize);

      console.log("signal generated");
      if (signal == undefined) return;

      // Score signal
      signal.score = this.scorer.score(signal, this.inventory.allSkews());
      // TODO configure score
      if (signal.score < 60) return;

      console.log(
        `Signal: ${pair} spread=${signal.spreadBps.toDecimalPlaces(2)}bps score=${signal.score}`,
      );

      // Execute
      const ctx = await this.executor.execute(signal);

      // Record result
      this.scorer.recordResult(pair, ctx.state == ExecutorState.DONE);

      if (ctx.state == ExecutorState.DONE)
        console.log(`SUCCESS: PnL=${ctx.actualNetPnl!.toDecimalPlaces(2)}`);
      else console.log(`FAILED: ${ctx.error}`);

      await this.syncBalances();
    });
  }
  async syncBalances() {
    const balances = await this.exchange.fetchBalance();
    this.inventory.updateFromCex(Venue.BINANCE, balances);
    //TODO
    // Wallet balances
    //await this.generator.pricing.client.getBalance();
    this.inventory.updateFromWallet(Venue.WALLET, {
      ETH: Decimal(1000),
      USDT: Decimal("100000"),
    });
  }
  stop() {
    this.running = false;
  }
}
async function main() {
  dotenv.config();
  const config = {
    pairs: ["ETH/USDT"],
    tradeSize: 0.1,
    simulation: true,
    signalConfig: {},
  };
  const bot = await ArbBot.create(config);
  bot.run();
}
main().catch((err) => console.error(err));
