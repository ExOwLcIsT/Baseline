import { Decimal } from "decimal.js";
import RebalancePlanner from "../inventory/RebalancePlanner.js";
import InventoryTracker, { Venue } from "../inventory/Tracker.js";
import { assert } from "node:console";
function parseArg(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(flag + "="));
  return arg?.split("=")[1];
}
const CEX_BALANCES = {
  ETH: {
    free: Decimal(2),
    used: Decimal(0),
  },
  USDT: {
    free: Decimal(18000),
    used: Decimal(0),
  },
};
const DEX_BALANCES = {
  ETH: Decimal(8),
  USDT: Decimal(12000),
};
function check() {
  const tracker = new InventoryTracker();
  tracker.updateFromCex(Venue.BINANCE, CEX_BALANCES);
  tracker.updateFromWallet(Venue.WALLET, DEX_BALANCES);
  const rebalancer = new RebalancePlanner(tracker, 20);

  const checked = rebalancer.checkAll();
  console.log("Inventory Skew Report");
  console.log("=".repeat(65));
  checked.forEach((c) => {
    const skew = tracker.skew(c.asset, 20);
    console.log(`Asset: ${c.asset}`);
    const venues = skew.venues;
    for (const venue in venues) {
      const value = venues[venue];

      console.log(
        `    ${venue}:  ${c.asset === "USDT" || c.asset === "USDC" ? "$" : ""}${value.amount}${c.asset === "USDT" || c.asset === "USDC" ? "" : c.asset}  (${value.pct}%)  <- deviation ${value.deviationPct}`,
      );
    }
    console.log(
      `    Status: ${skew.needsRebalance ? "⚠️  NEEDS REBALANCE" : `✅  OK (deviation: ${skew.maxDeviationPct}%)`}`,
    );
  });
  console.log();
  console.log("=".repeat(65));
  console.log();
}
function plan() {
  const asset = process.argv[3];
  console.log(`Rebalance plan: ${asset}`);
  const tracker = new InventoryTracker();
  tracker.updateFromCex(Venue.BINANCE, CEX_BALANCES);
  tracker.updateFromWallet(Venue.WALLET, DEX_BALANCES);
  const rebalancer = new RebalancePlanner(tracker, 20);
  const transferPlans = rebalancer.plan(asset);
  transferPlans.forEach((tp, index) => {
    console.log(`Transfer plan №${index + 1}: `);
    console.log(`   From: ${tp.fromVenue}`);
    console.log(`   To: ${tp.toVenue}`);
    console.log(`   Amount: ${tp.amount} ${asset}`);
    console.log(`   Fee: ${tp.estimatedFee} ${asset}`);
    console.log(`   ETA: ~${tp.estimatedTimeMin}`);
    console.log();
  });
}
async function main() {
  const isPlan = process.argv.find((a) => a === "--plan") ? true : false;
  if (isPlan) {
    plan();
  } else {
    check();
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
