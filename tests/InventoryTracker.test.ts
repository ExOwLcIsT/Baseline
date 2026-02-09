import { describe, test, expect } from "vitest";
import InventoryTracker, { Venue } from "../inventory/Tracker";
import { Decimal } from "decimal.js";
import RebalancePlanner from "../inventory/RebalancePlanner";
describe("Tracker", () => {
  const tracker: InventoryTracker = new InventoryTracker();

  const rebalancer: RebalancePlanner = new RebalancePlanner(tracker, 20);
  test("test_check_detects_skewed_asset", () => {
    /*Asset with 80/20 split flagged for rebalance.*/
    tracker.updateFromCex(Venue.BINANCE, {
      ETH: { free: Decimal(2), used: Decimal(0) },
    });
    tracker.updateFromWallet(Venue.WALLET, {
      ETH: Decimal(8),
    });
    expect(tracker.skew("ETH", 20).needsRebalance).toBe(true);
  });
  test("test_check_passes_balanced_asset", () => {
    /*Asset with 55/45 split not flagged.*/
    tracker.updateFromCex(Venue.BINANCE, {
      ETH: { free: Decimal(55), used: Decimal(0) },
    });
    tracker.updateFromWallet(Venue.WALLET, {
      ETH: Decimal(45),
    });
    expect(tracker.skew("ETH", 20).needsRebalance).toBe(false);
  });
  test("test_plan_generates_correct_transfer", () => {
    /*Plan moves the right amount in the right direction.*/
    tracker.updateFromCex(Venue.BINANCE, {
      ETH: { free: Decimal(2), used: Decimal(0) },
    });
    tracker.updateFromWallet(Venue.WALLET, {
      ETH: Decimal(8),
    });
    const plan = rebalancer.plan("ETH");

    expect(plan.length).toBe(1);
    expect(plan[0].amount.eq(3)).toBe(true);
    expect(plan[0].fromVenue).toBe(Venue.WALLET);
    expect(plan[0].toVenue).toBe(Venue.BINANCE);
  });
  test("test_plan_respects_min_operating_balance", () => {
    /*Never plans transfer that leaves venue below minimum.*/
    tracker.updateFromCex(Venue.BINANCE, {
      ETH: { free: Decimal(0.2), used: Decimal(0) },
    });
    tracker.updateFromWallet(Venue.WALLET, {
      ETH: Decimal(0.8),
    });
    const plan = rebalancer.plan("ETH");

    expect(plan.length).toBe(0);
  });
  test("test_plan_accounts_for_fees", () => {
    /*Net amount received = amount - fee.*/
    tracker.updateFromCex(Venue.BINANCE, {
      ETH: { free: Decimal(2), used: Decimal(0) },
    });
    tracker.updateFromWallet(Venue.WALLET, {
      ETH: Decimal(8),
    });
    const plan = rebalancer.plan("ETH");

    expect(plan.length).toBe(1);
    expect(plan[0].amount.eq(3)).toBe(true);
    expect(plan[0].fromVenue).toBe(Venue.WALLET);
    expect(plan[0].netAmount.eq(plan[0].amount.sub(plan[0].estimatedFee))).toBe(
      true,
    );
  });
  test("test_plan_empty_when_balanced", () => {
    /*No plans generated for balanced assets.*/
    tracker.updateFromCex(Venue.BINANCE, {
      ETH: { free: Decimal(55), used: Decimal(0) },
    });
    tracker.updateFromWallet(Venue.WALLET, {
      ETH: Decimal(45),
    });
    const plan = rebalancer.plan("ETH");
    expect(plan.length).toBe(0);
  });
  test("test_estimate_cost_sums_correctly", () => {
    /*Total fees and time calculated correctly.*/
    tracker.updateFromCex(Venue.BINANCE, {
      ETH: { free: Decimal(2), used: Decimal(0) },
    });
    tracker.updateFromWallet(Venue.WALLET, {
      ETH: Decimal(8),
    });
    const plan = rebalancer.plan("ETH");
    const totalFee = rebalancer.estimateCost(plan).totalFeesUsd;
    expect(totalFee.eq(plan[0].estimatedFee)).toBe(true);
  });
});
