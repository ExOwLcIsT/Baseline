# inventory/tracker.py

from dataclasses import dataclass, field
from decimal import Decimal
from datetime import datetime
from enum import Enum


class Venue(str, Enum):
    BINANCE = "binance"
    WALLET = "wallet"  # On-chain wallet (DEX venue)


PRICES = {
    "ETH": Decimal("2010"),
}


@dataclass
class Balance:
    venue: Venue
    asset: str
    free: Decimal
    locked: Decimal = field(default_factory=lambda: Decimal("0"))

    @property
    def total(self) -> Decimal:
        return self.free + self.locked


class InventoryTracker:
    """
    Tracks positions across CEX and DEX venues.
    Single source of truth for where your money is.
    """

    def __init__(self):
        self.balances: list[Balance] = []

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                    #
    # ------------------------------------------------------------------ #

    def _find(self, venue: Venue, asset: str) -> Balance | None:
        return next(
            (b for b in self.balances if b.venue == venue and b.asset == asset), None
        )

    # ------------------------------------------------------------------ #
    #  Updates                                                             #
    # ------------------------------------------------------------------ #

    def update_from_cex(self, venue: Venue, balances: dict):
        """
        Update balances from ExchangeClient.fetch_balance().
        Replaces previous snapshot for this venue.

        Args:
            venue:    Which CEX venue
            balances: {asset: {free, locked, total}} from ExchangeClient
        """
        for asset, data in balances.items():
            bal = self._find(venue, asset)
            if bal is None:
                self.balances.append(
                    Balance(venue, asset, data["free"], data.get("used", Decimal("0")))
                )
            else:
                bal.free = data["free"]
                bal.locked = data.get("used", Decimal("0"))

    def update_from_wallet(self, venue: Venue, balances: dict):
        """
        Update balances from on-chain wallet query.

        Args:
            venue:    Wallet venue
            balances: {asset: amount} from chain module
        """
        for asset, amount in balances.items():
            bal = self._find(venue, asset)
            if bal is None:
                self.balances.append(
                    Balance(venue, asset, Decimal(str(amount)), Decimal("0"))
                )
            else:
                bal.free = Decimal(str(amount))
                bal.locked = Decimal("0")

    # ------------------------------------------------------------------ #
    #  Snapshot                                                            #
    # ------------------------------------------------------------------ #

    def snapshot(self) -> dict:
        """
        Full portfolio snapshot at current time.

        Returns:
        {
            'timestamp': datetime,
            'venues': {
                'binance': {'ETH': {'free': ..., 'locked': ..., 'total': ...}},
                'wallet':  {'ETH': {'free': ..., 'locked': ..., 'total': ...}},
            },
            'totals':    {'ETH': Decimal('20.0'), 'USDT': Decimal('40000.0')},
            'total_usd': Decimal('80200.0'),
        }
        """
        venues: dict[str, dict] = {}
        totals: dict[str, Decimal] = {}

        for b in self.balances:
            venues.setdefault(b.venue, {})[b.asset] = {
                "free": b.free,
                "locked": b.locked,
                "total": b.total,
            }
            totals[b.asset] = totals.get(b.asset, Decimal("0")) + b.total

        return {
            "timestamp": datetime.now(),
            "venues": venues,
            "totals": totals,
            "total_usd": self.net_usd_value(PRICES),
        }

    # ------------------------------------------------------------------ #
    #  Queries                                                             #
    # ------------------------------------------------------------------ #

    def net_usd_value(self, prices: dict[str, Decimal]) -> Decimal:
        """Total portfolio value in USD."""
        total = Decimal("0")
        for b in self.balances:
            if b.asset in ("USDT", "USDC"):
                total += b.total
            elif b.asset in prices:
                total += b.total * prices[b.asset]
        return total

    def get_available(self, venue: Venue, asset: str) -> Decimal:
        """
        How much of `asset` is available to trade at `venue`.
        Returns free balance only (not locked in orders).
        """
        bal = self._find(venue, asset)
        return bal.free if bal else Decimal("0")

    # ------------------------------------------------------------------ #
    #  Pre-flight check                                                    #
    # ------------------------------------------------------------------ #

    def can_execute(
        self,
        buy_venue: Venue,
        buy_asset: str,
        buy_amount: Decimal,
        sell_venue: Venue,
        sell_asset: str,
        sell_amount: Decimal,
    ) -> dict:
        """
        Pre-flight check: can we execute both legs of an arb?

        Returns:
        {
            'can_execute':         bool,
            'buy_venue_available': Decimal,
            'buy_venue_needed':    Decimal,
            'sell_venue_available':Decimal,
            'sell_venue_needed':   Decimal,
            'reason':              str | None,
        }
        """
        buy_bal = self._find(buy_venue, buy_asset)
        sell_bal = self._find(sell_venue, sell_asset)

        if not buy_bal and not sell_bal:
            return {
                "can_execute": False,
                "buy_venue_available": Decimal("0"),
                "buy_venue_needed": buy_amount,
                "sell_venue_available": Decimal("0"),
                "sell_venue_needed": sell_amount,
                "reason": "No assets found",
            }

        if not buy_bal:
            return {
                "can_execute": False,
                "buy_venue_available": Decimal("0"),
                "buy_venue_needed": buy_amount,
                "reason": f"No asset {buy_asset} in {buy_venue} found",
            }

        if not sell_bal:
            return {
                "can_execute": False,
                "sell_venue_available": Decimal("0"),
                "sell_venue_needed": sell_amount,
                "reason": f"No asset {sell_asset} in {sell_venue} found",
            }

        buy_venue_available = buy_bal.free
        sell_venue_available = sell_bal.free
        buy_venue_needed = max(buy_amount - buy_bal.free, Decimal("0"))
        sell_venue_needed = max(sell_amount - sell_bal.free, Decimal("0"))

        if buy_venue_needed > 0:
            return {
                "can_execute": False,
                "buy_venue_available": buy_venue_available,
                "buy_venue_needed": buy_venue_needed,
                "reason": f"Not enough {buy_asset} to buy",
            }

        if sell_venue_needed > 0:
            return {
                "can_execute": False,
                "sell_venue_available": sell_venue_available,
                "sell_venue_needed": sell_venue_needed,
                "reason": f"Not enough {sell_asset} to sell",
            }

        return {
            "can_execute": True,
            "buy_venue_available": buy_venue_available,
            "buy_venue_needed": buy_venue_needed,
            "sell_venue_available": sell_venue_available,
            "sell_venue_needed": sell_venue_needed,
            "reason": None,
        }

    # ------------------------------------------------------------------ #
    #  Trade recording                                                     #
    # ------------------------------------------------------------------ #

    def record_trade(
        self,
        venue: Venue,
        side: str,  # "buy" or "sell"
        base_asset: str,
        quote_asset: str,
        base_amount: Decimal,
        quote_amount: Decimal,
        fee: Decimal,
        fee_asset: str,
    ):
        """
        Update internal balances after a trade executes.
        buy  → increases base,  decreases quote
        sell → decreases base,  increases quote
        fee  → deducted from fee_asset
        """
        # Pre-flight
        check = (
            self.can_execute(venue, quote_asset, quote_amount, venue, fee_asset, fee)
            if side == "buy"
            else self.can_execute(venue, base_asset, base_amount, venue, fee_asset, fee)
        )
        if not check["can_execute"]:
            raise ValueError(check["reason"])

        base_bal = self._find(venue, base_asset)
        # ← bug fix: was base_asset in JS
        quote_bal = self._find(venue, quote_asset)
        fee_bal = self._find(venue, fee_asset)

        if side == "buy":
            if base_bal is None:
                self.balances.append(Balance(venue, base_asset, base_amount))
            else:
                base_bal.free += base_amount  # ← bug fix: Decimal is immutable,
            quote_bal.free -= quote_amount  # must reassign not call .add()
        else:
            base_bal.free -= base_amount
            if quote_bal is None:
                self.balances.append(Balance(venue, quote_asset, quote_amount))
            else:
                quote_bal.free += quote_amount

        fee_bal.free -= fee

    # ------------------------------------------------------------------ #
    #  Skew / rebalance                                                    #
    # ------------------------------------------------------------------ #

    def skew(self, asset: str, threshold_pct: float = 30.0) -> dict:
        """
        Calculate distribution skew for an asset across venues.

        Returns:
        {
            'asset':            str,
            'total':            Decimal,
            'venues': {
                'binance': {'amount': Decimal, 'pct': float, 'deviation_pct': float},
                'wallet':  {'amount': Decimal, 'pct': float, 'deviation_pct': float},
            },
            'max_deviation_pct': float,
            'needs_rebalance':   bool,
        }
        """
        portfolio_venues = self.snapshot()["venues"]
        venues: dict[str, dict] = {}

        for venue, assets in portfolio_venues.items():
            if asset in assets:
                venues[venue] = {
                    "amount": assets[asset]["free"],
                    "pct": 0.0,
                    "deviation_pct": 0.0,
                }

        total = sum((v["amount"] for v in venues.values()), Decimal("0"))

        if total == 0:
            return {
                "asset": asset,
                "total": total,
                "venues": venues,
                "max_deviation_pct": 0.0,
                "needs_rebalance": False,
            }

        ideal_pct = 100 / len(venues)
        max_deviation = 0.0

        for v in venues.values():
            pct = float(v["amount"] / total * 100)
            deviation = pct - ideal_pct
            v["pct"] = pct
            v["deviation_pct"] = deviation
            if abs(deviation) > max_deviation:
                max_deviation = abs(deviation)

        return {
            "asset": asset,
            "total": total,
            "venues": venues,
            "max_deviation_pct": max_deviation,
            "needs_rebalance": max_deviation > threshold_pct,
        }

    def all_skews(self) -> list[dict]:
        """Returns rebalance status for every tracked asset."""
        assets = {b.asset for b in self.balances}
        return [
            {"asset": asset, "status": self.skew(asset)["needs_rebalance"]}
            for asset in assets
        ]
