import { Decimal } from "decimal.js";
import InventoryTracker, { Venue } from "./Tracker.js";

class TransferPlan {
  //A planned transfer between venues.
  fromVenue: Venue;
  toVenue: Venue;
  asset: string;
  amount: Decimal;
  estimatedFee: Decimal; // Withdrawal/gas fee
  estimatedTimeMin: number; // Minutes to complete

  netAmount(): Decimal {
    //Amount received after fees.
    return this.amount.sub(this.estimatedFee);
  }
  constructor(
    fromVenue: Venue,
    toVenue: Venue,
    asset: string,
    amount: Decimal,
    estimatedFee: Decimal,
    estimatedTimeMin: number,
  ) {
    this.fromVenue = fromVenue;
    this.toVenue = toVenue;
    this.asset = asset;
    this.amount = amount;
    this.estimatedFee = estimatedFee;
    this.estimatedTimeMin = estimatedTimeMin;
  }
}

export default class RebalancePlanner {
  /*
    Generates rebalancing plans when inventory skew exceeds threshold.
    Plans only — does NOT execute transfers.
    */
  tracker: InventoryTracker;
  thresholdPct: number;
  targetRatio: Record<Venue, number>;
  constructor(
    tracker: InventoryTracker,
    thresholdPct: number = 30.0, // Rebalance when deviation > 30%
    targetRatio: Record<Venue, number>, // Default: equal split
  ) {
    this.tracker = tracker;
    this.thresholdPct = thresholdPct;
    this.targetRatio = targetRatio;
  }

  checkAll(): {
    asset: string;
    maxDeviationPtc: number;
    needRebalance: boolean;
  }[] {
    /*
        Check all tracked assets for skew.
        Returns list of assets that need rebalancing.

        Returns:
        [
            {'asset': 'ETH', 'max_deviation_pct': 42.5, 'needs_rebalance': True},
            {'asset': 'USDT', 'max_deviation_pct': 15.2, 'needs_rebalance': False},
        ]
        */
    const checked: {
      asset: string;
      maxDeviationPtc: number;
      needRebalance: boolean;
    }[] = [];
    this.tracker.balances.forEach((b) => {
      const asset = b.asset;
      if (checked.find((b) => b.asset === asset) == undefined) {
        const res = this.tracker.skew(asset);
        checked.push({
          asset,
          maxDeviationPtc: res.maxDeviationPct,
          needRebalance: res.needsRebalance,
        });
      }
    });
    return checked;
  }

  plan(asset: string): TransferPlan[] {
    /*
      Generate transfer plan to rebalance a specific asset.

      Rules:
      - Only generate transfers that reduce skew
      - Respect minimum transfer amounts (e.g., Binance min withdrawal)
      - Account for transfer fees in the plan
      - Never plan a transfer that would leave a venue below minimum operating balance

      Returns list of TransferPlan objects.
      Empty list if no rebalance needed.
      */
    const res = this.tracker.skew(asset);
    if (!res.needsRebalance) return [];

    const assetbalances = this.tracker.balances.filter((b) => b.asset == asset);
    const total = assetbalances.reduce(
      (sum, b) => sum.add(b.total),
      Decimal(0),
    );
    const target = total.div(assetbalances.length);

    // Calculate surplus/deficit per venue
    const adjustments: [Venue, Decimal][] = [];
    assetbalances.forEach((b) => {
      adjustments.push([b.venue, b.total.sub(target)]);
    });

    // Generate transfers: from surplus to deficit
    const transfers: TransferPlan[] = [];
    const assetMinAmount: Decimal = MIN_OPERATING_BALANCE[asset] ?? Decimal(0);
    const surplus = adjustments.filter((pair) =>
      pair[1].sub(assetMinAmount).gt(0),
    ); // Balances with amount > target (min operated balance taken into account)
    const deficit = adjustments.filter((pair) => pair[1].lt(0)); // Balances with amount < target

    surplus.forEach((surPair) => {
      deficit.forEach((defPair) => {
        if (surPair[1].lte(0) || defPair[1].lte(0)) return;
        const transferAmount = Decimal.min(surPair[1], defPair[1]);
        const timeMin = TRANSFER_FEES[asset]
          ? TRANSFER_FEES[asset].estimatedTimeMin
          : 0;
        const estimatedFee = TRANSFER_FEES[asset]
          ? TRANSFER_FEES[asset].withdrawalFee
          : Decimal(0);
        transfers.push(
          new TransferPlan(
            surPair[0],
            defPair[0],
            asset,
            transferAmount,
            estimatedFee,
            timeMin,
          ),
        );
        surPair[1] = surPair[1].sub(transferAmount);
        defPair[1] = defPair[1].sub(transferAmount);
      });
    });

    return transfers;
  }

  planAll(): { [id: string]: TransferPlan[] } {
    /*
      Generate rebalancing plans for ALL skewed assets.
      Returns {asset: [TransferPlan, ...]}
      */
    const assets: string[] = [
      ...new Set(this.tracker.balances.map((b) => b.asset)),
    ]; // array of unique asset values
    const plans: { [id: string]: TransferPlan[] } = {};
    assets.forEach((asset) => {
      const assetPlans = this.plan(asset);
      plans[asset] = assetPlans;
    });
    return plans;
  }

  estimateCost(plans: TransferPlan[]): {
    totalTransfers: number;
    totalFeesUsd: Decimal;
    totalTimeMin: number; // Max of all transfer times (parallel)
    assetsAffected: string[];
  } {
    /*
      Estimate total cost of executing rebalance plans.

      Returns:
      {
          'totalTransfers': int,
          'totalFeesUsd': Decimal,
          'totalTimeMin': int,  # Max of all transfer times (parallel)
          'assetsAffected': list[str],
      }
      */
    const totalTimeMin = plans.reduce((sum, t) => sum + t.estimatedTimeMin, 0);
    const assetsAffected = [...new Set(plans.map((t) => t.asset))];
    return {
      totalTransfers: plans.length,
      totalFeesUsd: Decimal(0),
      totalTimeMin, // Max of all transfer times (parallel)
      assetsAffected,
    };
  }
}

const TRANSFER_FEES: {
  [id: string]: {
    withdrawalFee: Decimal; // ETH network
    minWithdrawal: Decimal;
    confirmations: number;
    estimatedTimeMin: number;
  };
} = {
  ETH: {
    withdrawalFee: Decimal("0.005"), // ETH network
    minWithdrawal: Decimal("0.01"),
    confirmations: 12,
    estimatedTimeMin: 15,
  },
  USDT: {
    withdrawalFee: Decimal("1.0"), // ERC-20
    minWithdrawal: Decimal("10.0"),
    confirmations: 12,
    estimatedTimeMin: 15,
  },
  USDC: {
    withdrawalFee: Decimal("1.0"),
    minWithdrawal: Decimal("10.0"),
    confirmations: 12,
    estimatedTimeMin: 15,
  },
};

const MIN_OPERATING_BALANCE: { [id: string]: Decimal } = {
  // Keep at least this much at each venue to continue trading
  ETH: Decimal("0.5"),
  USDT: Decimal("500"),
  USDC: Decimal("500"),
};
