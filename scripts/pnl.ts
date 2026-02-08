import PnLEngine from "../inventory/PnL.js";
import { Decimal } from "decimal.js";
import { ArbRecord, TradeLeg } from "../inventory/PnL.js";
import { Venue } from "../inventory/Tracker.js";

const FEE = new Decimal("0.463829787");
const HALF_FEE = FEE.div(2);
const PRICE = new Decimal(2000);
const NOTIONAL = new Decimal("2004.255319148936");
const AMOUNT = NOTIONAL.div(PRICE);

function make(id: number, net: string): ArbRecord {
  const netPnl = new Decimal(net);
  const gross = netPnl.add(FEE);
  const sellPrice = PRICE.add(gross.div(AMOUNT));

  const ts = new Date(Date.now() + Math.floor(Math.random() * 1000 * 60 * 60));

  const direction = Math.round(Math.random()) == 0 ? true : false;
  return new ArbRecord(
    `arb-${id}`,
    ts,
    new TradeLeg(
      `b${id}`,
      ts,
      direction ? Venue.BINANCE : Venue.WALLET,
      "ETH/USDT",
      "buy",
      AMOUNT,
      PRICE,
      HALF_FEE,
      "USDT",
    ),
    new TradeLeg(
      `s${id}`,
      ts,
      direction ? Venue.WALLET : Venue.BINANCE,
      "ETH/USDT",
      "sell",
      AMOUNT,
      sellPrice,
      HALF_FEE,
      "USDT",
    ),
    new Decimal(0),
  );
}

const ARB_TRADES: ArbRecord[] = [
  make(1, "4.21"),

  ...Array.from({ length: 33 }, (_, i) => make(i + 2, "1.00")),

  make(35, "-1.05"),

  ...Array.from({ length: 12 }, (_, i) => make(i + 36, "-0.64")),
];

async function main() {
  console.log("PnL Summary (last 24h)");
  console.log("=".repeat(65));
  const pnl = new PnLEngine();
  ARB_TRADES.forEach((at) => pnl.record(at));
  const res = pnl.summary();
  console.log(`Total Trades:        ${res.totalTrades}`);
  console.log(`Win Rate:            ${res.winRate}%`);
  console.log(`Total PnL:           $${res.totalPnlUsd?.toDecimalPlaces(2)}`);
  console.log(`Total Fees:          $${res.totalFeesUsd?.toDecimalPlaces(2)}`);
  console.log(
    `Avg PnL/Trade:       $${res.avgPnlPerTrade?.toDecimalPlaces(2)}`,
  );
  console.log(`Avg PnL (bps):       ${res.avgPnlBps?.toDecimalPlaces(2)} bps`);
  console.log(`Best Trade:          $${res.bestTradePnl?.toDecimalPlaces(2)}`);
  console.log(
    `Worst Trade:         -$${res.worstTradePnl?.abs().toDecimalPlaces(2)}`,
  );
  console.log(`Total Notional:      $${res.totalNotional?.toDecimalPlaces(2)}`);
  pnl.recent();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
/*

Total Trades:        47
Win Rate:            72.3%
Total PnL:           $38.52
Total Fees:          $21.80
Avg PnL/Trade:       $0.82
Avg PnL (bps):       1.8 bps
Best Trade:          $4.21
Worst Trade:         -$1.05
Total Notional:      $94,200

Recent Trades:
  14:30  ETH  Buy Uniswap / Sell Binance  +$1.25 (2.1 bps) ✅
  14:28  ETH  Buy Uniswap / Sell Binance  +$0.90 (1.5 bps) ✅
  14:25  ETH  Buy Binance / Sell Uniswap  -$0.30 (-0.5 bps) ❌
  14:22  ETH  Buy Uniswap / Sell Binance  +$1.80 (3.0 bps) ✅
  */
