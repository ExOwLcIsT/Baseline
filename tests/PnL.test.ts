import { describe, test, expect , beforeEach} from "vitest";
import { Decimal } from "decimal.js";
import PnLEngine, { ArbRecord, TradeLeg } from "../inventory/PnL";
import { Venue } from "../inventory/Tracker";

import fs from "fs";
import path from "path";
const ts = new Date();

function leg(side: "buy" | "sell", price: number, fee = 0): TradeLeg {
  return new TradeLeg(
    crypto.randomUUID(),
    ts,
    Venue.BINANCE,
    "ETH/USDT",
    side,
    new Decimal(1),
    new Decimal(price),
    new Decimal(fee),
    "USDT",
  );
}

function trade(buy: number, sell: number, buyFee = 0, sellFee = 0, gas = 0) {
  return new ArbRecord(
    crypto.randomUUID(),
    ts,
    leg("buy", buy, buyFee),
    leg("sell", sell, sellFee),
    new Decimal(gas),
  );
}

describe("PNLEngine", () => {
  let engine :PnLEngine;
  beforeEach(()=>{
   engine = new PnLEngine()
  })
  test("test_gross_pnl_calculation", () => {
    /*Gross PnL = sell revenue - buy cost.*/
    const t = trade(100, 110);

    expect(t.grossPnl.eq(10)).toBe(true);
  });
  test("test_net_pnl_includes_all_fees", () => {
    /*Net PnL = gross - buy fee - sell fee - gas.*/
    const t = trade(100, 110, 1, 2, 3);

    expect(t.netPnl.eq(4)).toBe(true);
  });
  test("test_pnl_bps_calculation", () => {
    /*PnL bps = net_pnl / notional * 10000.*/
    const t = trade(100, 110);

    expect(t.netPnlBps.eq(1000)).toBe(true);
  });
  test("test_summary_win_rate", () => {
    /*Win rate = profitable trades / total trades.*/
    engine.record(trade(100, 110)); // +10
    engine.record(trade(100, 90)); // -10
    engine.record(trade(100, 120)); // +20

    const s = engine.summary();

    expect(s.totalTrades).toBe(3);
    expect(s.winRate).toBeCloseTo(66.67, 2);
  });
  test("test_summary_with_no_trades", () => {
    /*Summary returns zeros, no division errors.*/
    const s = engine.summary();

    expect(s.totalTrades).toBe(0);
  });
  test("test_export_csv_format", () => {
    /*CSV has expected columns and correct values.*/
    const file = path.join(process.cwd(), "test.csv");

    engine.record(trade(100, 110, 1, 1, 1));
    engine.export_csv(file);

    const text = fs.readFileSync(file, "utf8");

    expect(text.includes("gross_pnl")).toBe(true);
    expect(text.split("\n").length).toBe(2); // header + 1 row

    fs.unlinkSync(file);
  });
});
