import { Decimal } from "decimal.js";
export enum Venue {
  BINANCE = "binance",
  WALLET = "wallet", // On-chain wallet (DEX venue)
}

const PRICES = {
  ETH: Decimal(2010),
};
class Balance {
  venue: Venue;
  asset: string;
  free: Decimal;
  used: Decimal;

  get total(): Decimal {
    return this.free.add(this.used);
  }
  constructor(venue: Venue, asset: string, free: Decimal, used: Decimal) {
    this.venue = venue;
    this.free = free;
    this.used = used;
    this.asset = asset;
  }
}

export default class InventoryTracker {
  /*
    Tracks positions across CEX and DEX venues.
    Single source of truth for where your money is.
    */
  balances: Balance[] = [];
  constructor() {
    // Initialize tracker for given venues.
  }

  updateFromCex(
    venue: Venue,
    balances: { [id: string]: { free: Decimal; used: Decimal } },
  ) {
    /*
        Update balances from ExchangeClient.fetch_balance().
        Replaces previous snapshot for this venue.

        Args:
            venue: Which CEX venue
            balances: {asset: {free, locked, total}} from ExchangeClient
        */
    for (const asset of Object.keys(balances)) {
      const bal = this.balances.find(
        (b) => b.venue === venue && b.asset === asset,
      );
      if (!bal) {
        const newBal = new Balance(
          venue,
          asset,
          balances[asset].free,
          balances[asset].used,
        );
        this.balances.push(newBal);
        continue;
      }
      bal.free = balances[asset].free;
      bal.used = balances[asset].used;
    }
  }

  updateFromWallet(venue: Venue, balances: { [id: string]: Decimal }) {
    /*
        Update balances from on-chain wallet query.

        Args:
            venue: Wallet venue
            balances: {asset: amount} from chain/ module
        "*/
    for (const asset of Object.keys(balances)) {
      const bal = this.balances.find(
        (b) => b.venue === venue && b.asset === asset,
      );
      if (!bal) {
        const newBal = new Balance(venue, asset, balances[asset], Decimal(0));
        this.balances.push(newBal);
        continue;
      }
      bal.free = Decimal(balances[asset]);
      bal.used = Decimal(0);
    }
  }

  snapshot(): {
    timestamp: Date;
    venues: {
      [id: string]: {
        [id: string]: { free: Decimal; used: Decimal; total: Decimal };
      };
    };
    totals: {
      [id: string]: Decimal;
    };
    totalUsd: Decimal;
  } {
    /*
        Full portfolio snapshot at current time.

        Returns:
        {
            'timestamp': Date,
            'venues': {
                'binance': {'ETH': {'free': , 'locked': , 'total': }, },
                'wallet':  {'ETH': {'free': , 'locked': , 'total': }, },
            },
            'totals': {
                'ETH':  Decimal('20.0'),
                'USDT': Decimal('40000.0'),
            },
            'total_usd': Decimal('80200.0'),  # requires price feed
        }
        "*/
    const timestamp = new Date();
    const venues: {
      [id: string]: {
        [id: string]: { free: Decimal; used: Decimal; total: Decimal };
      };
    } = {};

    const totals: { [id: string]: Decimal } = {};
    this.balances.forEach((b) => {
      if (!venues[b.venue]) {
        venues[b.venue] = {};
      }
      venues[b.venue][b.asset] = { free: b.free, used: b.used, total: b.total };
      if (!totals[b.asset]) totals[b.asset] = new Decimal(0);
      totals[b.asset] = totals[b.asset].plus(b.total);
    });

    return {
      timestamp,
      venues,
      totals,
      totalUsd: this.netUsdValue(PRICES),
    };
  }
  netUsdValue(prices: { [id: string]: Decimal }): Decimal {
    // Total portfolio value in USD.
    let total = Decimal("0");
    this.balances.forEach((b) => {
      if (b.asset === "USDT" || b.asset === "USDC") {
        total = total.add(b.total);
      } else if (b.asset in prices) {
        total = total.add(b.total.mul(prices[b.asset]));
      }
    });
    return total;
  }
  getAvailable(venue: Venue, asset: string): Decimal {
    /*
      How much of `asset` is available to trade at `venue`.
      Returns free balance only (not locked in orders).
      "*/

    const bal = this.balances.find((b) => b.asset == asset && b.venue == venue);

    return bal ? bal.free : Decimal(0);
  }

  canExecute(
    buyVenue: Venue,
    buyAsset: string, // What you're spending (e.g., "USDT")
    buyAmount: Decimal, // How much you're spending
    sellVenue: Venue,
    sellAsset: string, // What you're selling (e.g., "ETH")
    sellAmount: Decimal, // How much you're selling
  ): {
    canExecute: boolean;
    buyVenueAvailable?: Decimal;
    buyVenueNeeded?: Decimal;
    sellVenueAvailable?: Decimal;
    sellVenueNeeded?: Decimal;
    reason: string | undefined; // Why not, if can_execute=False
  } {
    /*
      Pre-flight check: can we execute both legs of an arb?

      Returns:
      {
          'can_execute': bool,
          'buy_venue_available': Decimal,
          'buy_venue_needed': Decimal,
          'sell_venue_available': Decimal,
          'sell_venue_needed': Decimal,
          'reason': string or None,  # Why not, if can_execute=False
      }
      */
    let canExecute = true;
    const buyBalance = this.balances.find(
      (b) => b.asset == buyAsset && b.venue == buyVenue,
    );
    const sellBalance = this.balances.find(
      (b) => b.asset == sellAsset && b.venue == sellVenue,
    );
    if (!buyBalance && !sellBalance) {
      canExecute = false;
      return {
        canExecute,
        buyVenueAvailable: Decimal(0),
        buyVenueNeeded: buyAmount,
        sellVenueAvailable: Decimal(0),
        sellVenueNeeded: sellAmount,
        reason: `No assets found`,
      };
    }

    if (!buyBalance) {
      canExecute = false;
      return {
        canExecute,
        buyVenueAvailable: Decimal(0),
        buyVenueNeeded: buyAmount,
        reason: `No asset ${buyAsset} in ${buyVenue} found`,
      };
    }

    if (!sellBalance) {
      canExecute = false;
      return {
        canExecute,
        sellVenueAvailable: Decimal(0),
        sellVenueNeeded: sellAmount,
        reason: `No asset ${sellAsset} in ${sellVenue} found`,
      };
    }
    const buyVenueAvailable = buyBalance.free;
    const buyVenueNeeded = Decimal.max(buyAmount.sub(buyBalance.free), 0);
    const sellVenueAvailable = sellBalance.free;
    const sellVenueNeeded = Decimal.max(sellAmount.sub(sellBalance.free), 0);

    if (buyVenueNeeded.gt(0)) {
      canExecute = false;
      return {
        canExecute,
        buyVenueAvailable,
        buyVenueNeeded: buyVenueNeeded,
        reason: `Not enough asset ${buyAsset} to buy`,
      };
    }
    if (sellVenueNeeded.gt(0)) {
      canExecute = false;
      return {
        canExecute,
        sellVenueAvailable,
        sellVenueNeeded: sellVenueNeeded,
        reason: `Not enough asset ${sellAsset} to sell`,
      };
    }
    return {
      canExecute,
      buyVenueAvailable,
      buyVenueNeeded,
      sellVenueAvailable,
      sellVenueNeeded,
      reason: undefined,
    };
  }

  recordTrade(
    venue: Venue,
    side: "buy" | "sell",
    baseAsset: string,
    quoteAsset: string,
    baseAmount: Decimal,
    quoteAmount: Decimal,
    fee: Decimal,
    feeAsset: string,
  ) {
    /*
      Update internal balances after a trade executes.
      Must handle: buy increases base / decreases quote,
                   sell decreases base / increases quote,
                   fee deducted from fee_asset.
      "*/
    const check =
      side == "buy"
        ? this.canExecute(venue, quoteAsset, quoteAmount, venue, feeAsset, fee)
        : this.canExecute(venue, baseAsset, baseAmount, venue, feeAsset, fee);
    if (check.canExecute) {
      throw new Error(check.reason);
    }

    const baseBalance = this.balances.find(
      (b) => b.asset == baseAsset && b.venue == venue,
    );
    const quoteBalance = this.balances.find(
      (b) => b.asset == baseAsset && b.venue == venue,
    );
    const feeBalance = this.balances.find(
      (b) => b.asset == feeAsset && b.venue == venue,
    );

    if (side == "buy") {
      if (!baseBalance) {
        this.balances.push(
          new Balance(venue, baseAsset, baseAmount, Decimal(0)),
        );
      } else {
        baseBalance.free.add(baseAmount);
      }
      quoteBalance!.free.sub(quoteAmount);
    } else {
      baseBalance!.free.sub(baseAmount);
      if (!quoteBalance) {
        this.balances.push(
          new Balance(venue, quoteAsset, quoteAmount, Decimal(0)),
        );
      } else {
        quoteBalance.free.add(quoteAmount);
      }
    }
    feeBalance!.free.sub(fee);
  }

  skew(
    asset: string,
    thresholdPct: number,
  ): {
    asset: string;
    total: Decimal;
    venues: {
      [id: string]: { amount: Decimal; pct: number; deviationPct: number };
    };
    maxDeviationPct: number;
    needsRebalance: boolean;
  } {
    /*
      Calculate distribution skew for an asset across venues.

      Returns:
      {
          'asset': string,
          'total': Decimal,
          'venues': {
              'binance': {'amount': Decimal, 'pct': float, 'deviation_pct': float},
              'wallet':  {'amount': Decimal, 'pct': float, 'deviation_pct': float},
          },
          'max_deviation_pct': float,
          'needs_rebalance': bool,  # True if max_deviation > 30%
      }
      */
    const portfolio = this.snapshot();
    const portfolioVenues = portfolio.venues;
    const venues: {
      [id: string]: { amount: Decimal; pct: number; deviationPct: number };
    } = {};
    for (const venue in portfolioVenues) {
      venues[venue] = {
        amount: portfolioVenues[venue][asset].free,
        pct: 0,
        deviationPct: 0,
      };
    }
    let total = new Decimal(0);
    for (const v of Object.values(venues)) {
      total = total.plus(v.amount);
    }
    if (total.eq(0)) {
      return {
        asset,
        total,
        venues,
        maxDeviationPct: 0,
        needsRebalance: false,
      };
    }
    const venueCount = Object.keys(venues).length;
    const idealPct = 100 / venueCount;

    let maxDeviationPct = 0;

    for (const key of Object.keys(venues)) {
      const v = venues[key];

      const pct = v.amount.div(total).mul(100).toNumber();
      const deviation = pct - idealPct;

      v.pct = pct;
      v.deviationPct = deviation;

      if (Math.abs(deviation) > maxDeviationPct) {
        maxDeviationPct = Math.abs(deviation);
      }
    }

    return {
      asset,
      total,
      venues,
      maxDeviationPct,
      needsRebalance: maxDeviationPct > thresholdPct,
    };
  }
}
