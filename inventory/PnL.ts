import { Decimal } from "decimal.js";
import { Venue } from "./Tracker.js";
import * as fs from "fs";
class TradeLeg {
  // Single execution leg.
  id: string;
  timestamp: Date;
  venue: Venue;
  symbol: string; // "ETH/USDT"
  side: "buy" | "sell"; // "buy" or "sell"
  amount: Decimal; // Base asset qty
  price: Decimal; // Execution price
  fee: Decimal;
  feeAsset: string;
  constructor(
    id: string,
    timestamp: Date,
    venue: Venue,
    symbol: string,
    side: "buy" | "sell",
    amount: Decimal,
    price: Decimal,
    fee: Decimal,
    feeAsset: string,
  ) {
    this.id = id;
    this.timestamp = timestamp;
    this.venue = venue;
    this.symbol = symbol;
    this.side = side;
    this.amount = amount;
    this.price = price;
    this.fee = fee;
    this.feeAsset = feeAsset;
  }
}

class ArbRecord {
  // Complete arb trade with both legs.
  id: string;
  timestamp: Date;
  buyLeg: TradeLeg;
  sellLeg: TradeLeg;
  gasCostUsd: Decimal;

  /**
   *
   */
  constructor(
    id: string,
    timestamp: Date,
    buyLeg: TradeLeg,
    sellLeg: TradeLeg,
    gasCostUsd: Decimal = Decimal(0),
  ) {
    this.id = id;
    this.timestamp = timestamp;
    this.buyLeg = buyLeg;
    this.sellLeg = sellLeg;
    this.gasCostUsd = gasCostUsd;
  }
  get grossPnl(): Decimal {
    /*Price difference revenue*/
    const revenue = this.sellLeg.amount.mul(this.sellLeg.price);
    const cost = this.buyLeg.amount.mul(this.buyLeg.price);
    return revenue.sub(cost);
  }

  get totalFees(): Decimal {
    /*All fees: both legs + gas*/
    return this.buyLeg.fee.add(this.sellLeg.fee).add(this.gasCostUsd);
  }

  get netPnl(): Decimal {
    /*Gross - fees*/
    return this.grossPnl.sub(this.totalFees);
  }

  get netPnlBps(): Decimal {
    /*Net PnL in basis points of notional*/
    const notional = this.notional;
    if (notional.eq(0)) return Decimal(0);
    return this.netPnl.div(notional).mul(Decimal(10000));
  }

  get notional(): Decimal {
    /*Trade size in quote currency*/
    return this.buyLeg.amount.mul(this.buyLeg.price);
  }
}
export default class PnLEngine {
  /*
    Tracks all arb trades and produces PnL reports.
    */
  trades: ArbRecord[];
  constructor() {
    this.trades = [];
  }
  record(trade: ArbRecord) {
    // Record a completed arb trade.
    this.trades.push(trade);
  }

  summary(trades?: ArbRecord[]): {
    totalTrades: number;
    totalPnlUsd?: Decimal;
    totalFeesUsd?: Decimal;
    avgPnlPerTrade?: Decimal;
    avgPnlBps?: Decimal;
    winRate?: number;
    bestTradePnl?: Decimal;
    worstTradePnl?: Decimal;
    totalNotional?: Decimal;
    sharpeEstimate?: number;
    pnlByHour?: { [id: string]: Decimal };
  } {
    /*
        Aggregate PnL summary.

        Returns:
        {
            'total_trades': int,
            'total_pnl_usd': Decimal,
            'total_fees_usd': Decimal,
            'avg_pnl_per_trade': Decimal,
            'avg_pnl_bps': Decimal,
            'win_rate': float,           # % of trades with positive PnL
            'best_trade_pnl': Decimal,
            'worst_trade_pnl': Decimal,
            'total_notional': Decimal,
            'sharpe_estimate': float,    # PnL / stddev(PnL) — rough estimate
            'pnl_by_hour': dict,         # {hour: total_pnl}
        }
        */
    if (!trades) trades = [...this.trades];
    if (trades.length === 0) return { totalTrades: 0 };

    const pnls = trades.map((t) => t.netPnl);
    const winning = pnls.filter((p) => p.gt(0));
    const losing = pnls.filter((p) => p.lte(0));
    const totalPnl = pnls.reduce((sum, p) => p.add(sum), Decimal(0));
    const avgPnlPerTrade = totalPnl.div(pnls.length);
    const avgPnlBps = trades
      .map((t) => t.netPnlBps)
      .reduce((sum, p) => sum.add(p), Decimal(0))
      .div(trades.length);
    const bestTradePnl = pnls.sort()[pnls.length - 1];
    const worstTradePnl = pnls.sort()[0];
    const totalNotional = trades.reduce(
      (sum, t) => sum.add(t.notional),
      Decimal(0),
    );
    return {
      totalTrades: trades.length,
      totalPnlUsd: Decimal(0),
      totalFeesUsd: Decimal(0),
      avgPnlPerTrade,
      avgPnlBps,
      winRate: winning.length / trades.length,
      bestTradePnl,
      worstTradePnl,
      totalNotional,
      // sharpeEstimate?: number,
      // pnlByHour?: { [id: string]: Decimal };
    };
  }

  recent(n: number = 10) {
    /*
        Last N trades as summary dicts.
        For display in CLI dashboard.
        */
    const len = this.trades.length;
    if (len < n) throw new Error("Not enough trades recorder");
    return this.summary(this.trades.slice(len - n, len - 1));
  }

  export_csv(filepath: string): void {
    /*Export all trades to CSV for analysis*/
    if (!this.trades || this.trades.length === 0) {
      fs.writeFileSync(filepath, "");
      return;
    }

    const header = [
      "id",
      "timestamp",

      "buy_venue",
      "buy_asset",
      "buy_amount",
      "buy_price",
      "buy_fee",

      "sell_venue",
      "sell_asset",
      "sell_amount",
      "sell_price",
      "sell_fee",

      "gas_usd",
      "notional",
      "gross_pnl",
      "total_fees",
      "net_pnl",
      "net_pnl_bps",
    ].join(",");

    const rows = this.trades.map((t: ArbRecord) =>
      [
        t.id,
        t.timestamp.toISOString(),

        t.buyLeg.venue,
        t.buyLeg.symbol,
        t.buyLeg.amount.toString(),
        t.buyLeg.price.toString(),
        t.buyLeg.fee.toString(),

        t.sellLeg.venue,
        t.sellLeg.symbol,
        t.sellLeg.amount.toString(),
        t.sellLeg.price.toString(),
        t.sellLeg.fee.toString(),

        t.gasCostUsd.toString(),
        t.notional.toString(),
        t.grossPnl.toString(),
        t.totalFees.toString(),
        t.netPnl.toString(),
        t.netPnlBps.toString(),
      ].join(","),
    );

    const csv = [header, ...rows].join("\n");

    fs.writeFileSync(filepath, csv);
  }
}
