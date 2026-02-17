# inventory/rebalancer.py

from dataclasses import dataclass
from decimal import Decimal

from inventory.tracker import InventoryTracker, Venue


@dataclass
class TransferPlan:
    """A planned transfer between venues."""
    from_venue: Venue
    to_venue: Venue
    asset: str
    amount: Decimal
    estimated_fee: Decimal      # Withdrawal/gas fee
    estimated_time_min: int     # Minutes to complete

    @property
    def net_amount(self) -> Decimal:
        """Amount received after fees."""
        return self.amount - self.estimated_fee


class RebalancePlanner:
    """
    Generates rebalancing plans when inventory skew exceeds threshold.
    Plans only — does NOT execute transfers.
    """

    def __init__(
        self,
        tracker: InventoryTracker,
        threshold_pct: float = 30.0,    # Rebalance when deviation > 30%
        target_ratio: dict[Venue, float] = None,  # Default: equal split
    ):
        self.tracker: InventoryTracker = tracker
        self.threshold_pct = threshold_pct
        self.target_ratio: dict[Venue, float] = target_ratio

    def check_all(self) -> list[dict]:
        """
        Check all tracked assets for skew.
        Returns list of assets that need rebalancing.

        Returns:
        [
            {'asset': 'ETH', 'max_deviation_pct': 42.5, 'needs_rebalance': True},
            {'asset': 'USDT', 'max_deviation_pct': 15.2, 'needs_rebalance': False},
        ]
        """
        checked = []
        for b in self.tracker.balances:
            asset = b.asset
            if b.asset not in checked:
                res = self.tracker.skew(asset, self.thresholdPct)
                checked.append({
                    'asset': asset,
                    'maxDeviationPtc': res.maxDeviationPct,
                    'needRebalance': res.needsRebalance,
                })

        return checked

    def plan(self, asset: str) -> list[TransferPlan]:
        """
        Generate transfer plan to rebalance a specific asset.

        Rules:
        - Only generate transfers that reduce skew
        - Respect minimum transfer amounts (e.g., Binance min withdrawal)
        - Account for transfer fees in the plan
        - Never plan a transfer that would leave a venue below minimum operating balance

        Returns list of TransferPlan objects.
        Empty list if no rebalance needed.
        """
        res = self.tracker.skew(asset, self.thresholdPct)
        if (not res.needsRebalance):
            return []

        asset_balances = [b for b in self.tracker.balances if b.asset == asset]
        total = sum((b.total for b in asset_balances), Decimal("0"))
        target = total / (len(asset_balances))
        # Calculate surplus/deficit per venue
        adjustments: list[(Venue, Decimal)] = []
        for b in asset_balances:
            adjustments.push([b.venue, b.total.sub(target)])

        # Generate transfers: from surplus to deficit
        transfers: list[TransferPlan] = []
        assetMinAmount: Decimal = MIN_OPERATING_BALANCE.get(
            "asset", Decimal(0))

        surplus = [pair for pair in adjustments if (
            pair[1] - assetMinAmount > 0)]
        # Balances with amount > target(min operated balance taken into account)

        # Balances with amount < target
        deficit = [pair for pair in adjustments if pair[1] < 0]
        for surPair in surplus:
            for defPair in deficit:
                if surPair[1] <= 0 or defPair[1] >= 0:
                    return
                transferAmount = Decimal.min(
                    surPair[1], abs(defPair[1]))
                timeMin = TRANSFER_FEES[asset].estimatedTimeMin if TRANSFER_FEES.get(
                    "asset") is not None else 0
                estimatedFee = TRANSFER_FEES[asset].withdrawalFee if TRANSFER_FEES.get(
                    "asset") is not None else Decimal(0)
                transfers.append(
                    TransferPlan(
                        surPair[0],
                        defPair[0],
                        asset,
                        transferAmount,
                        estimatedFee,
                        timeMin,
                    ),
                )
                surPair[1] = surPair[1].sub(transferAmount)
                defPair[1] = defPair[1].sub(transferAmount)

            return transfers

    def plan_all(self) -> dict[str, list[TransferPlan]]:
        """
        Generate rebalancing plans for ALL skewed assets.
        Returns {asset: [TransferPlan, ...]}
        """
        assets: {str} = {[b.asset for b in self.tracker.balances]
                         }  # array of unique asset values
        plans: dict[str, TransferPlan] = dict()
        for asset in assets:
            assetPlans = self.plan(asset)
            plans[asset] = assetPlans
        return plans

    def estimate_cost(self, plans: list[TransferPlan]) -> dict:
        """
        Estimate total cost of executing rebalance plans.

        Returns:
        {
            'total_transfers': int,
            'total_fees_usd': Decimal,
            'total_time_min': int,  # Max of all transfer times (parallel)
            'assets_affected': list[str],
        }
        """
        total_time_min = max((p.estimated_time_min for p in plans), default=0)
        total_fees_usd = sum((p.estimated_fee for p in plans), Decimal("0"))
        
        assets_affected = list({p.asset for p in plans})

        return {
            "total_transfers":  len(plans),
            "total_fees_usd":   total_fees_usd,
            "total_time_min":   total_time_min,
            "assets_affected":  assets_affected,
        }


# Hardcoded for testnet / estimation purposes
TRANSFER_FEES = {
    'ETH': {
        'withdrawal_fee': Decimal('0.005'),   # ETH network
        'min_withdrawal': Decimal('0.01'),
        'confirmations': 12,
        'estimated_time_min': 15,
    },
    'USDT': {
        'withdrawal_fee': Decimal('1.0'),     # ERC-20
        'min_withdrawal': Decimal('10.0'),
        'confirmations': 12,
        'estimated_time_min': 15,
    },
    'USDC': {
        'withdrawal_fee': Decimal('1.0'),
        'min_withdrawal': Decimal('10.0'),
        'confirmations': 12,
        'estimated_time_min': 15,
    },
}

MIN_OPERATING_BALANCE = {
    # Keep at least this much at each venue to continue trading
    'ETH': Decimal('0.5'),
    'USDT': Decimal('500'),
    'USDC': Decimal('500'),
}
