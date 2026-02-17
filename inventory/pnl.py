# inventory/pnl.py

import csv
import statistics
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from inventory.tracker import Venue


@dataclass
class TradeLeg:
    """Single execution leg."""

    id: str
    timestamp: datetime
    venue: Venue
    symbol: str  # "ETH/USDT"
    side: str  # "buy" or "sell"
    amount: Decimal  # Base asset qty
    price: Decimal  # Execution price
    fee: Decimal
    fee_asset: str


@dataclass
class ArbRecord:
    """Complete arb trade with both legs."""

    id: str
    timestamp: datetime
    buy_leg: TradeLeg
    sell_leg: TradeLeg
    gas_cost_usd: Decimal = field(default_factory=lambda: Decimal("0"))

    @property
    def gross_pnl(self) -> Decimal:
        """Price difference revenue."""
        revenue = self.sell_leg.amount * self.sell_leg.price
        cost = self.buy_leg.amount * self.buy_leg.price
        return revenue - cost

    @property
    def total_fees(self) -> Decimal:
        """All fees: both legs + gas."""
        return self.buy_leg.fee + self.sell_leg.fee + self.gas_cost_usd

    @property
    def net_pnl(self) -> Decimal:
        """Gross - fees."""
        return self.gross_pnl - self.total_fees

    @property
    def net_pnl_bps(self) -> Decimal:
        """Net PnL in basis points of notional."""
        if self.notional == 0:
            return Decimal("0")
        return self.net_pnl / self.notional * Decimal("10000")

    @property
    def notional(self) -> Decimal:
        """Trade size in quote currency."""
        return self.buy_leg.amount * self.buy_leg.price


class PnLEngine:
    """Tracks all arb trades and produces PnL reports."""

    def __init__(self):
        self.trades: list[ArbRecord] = []

    # ------------------------------------------------------------------ #

    def record(self, trade: ArbRecord):
        """Record a completed arb trade."""
        self.trades.append(trade)

    # ------------------------------------------------------------------ #

    def summary(self) -> dict:
        """
        Aggregate PnL summary.

        Returns:
        {
            'total_trades':      int,
            'total_pnl_usd':     Decimal,
            'total_fees_usd':    Decimal,
            'avg_pnl_per_trade': Decimal,
            'avg_pnl_bps':       Decimal,
            'win_rate':          float,   # % of trades with positive PnL
            'best_trade_pnl':    Decimal,
            'worst_trade_pnl':   Decimal,
            'total_notional':    Decimal,
            'sharpe_estimate':   float,   # PnL / stddev(PnL) — rough estimate
            'pnl_by_hour':       dict,    # {hour: total_pnl}
        }
        """
        if not self.trades:
            return {"total_trades": 0}

        pnls = [t.net_pnl for t in self.trades]
        total_pnl = sum(pnls, Decimal("0"))
        total_notional = sum((t.notional for t in self.trades), Decimal("0"))
        # ← bug fix: JS used gasCostUsd only
        total_fees = sum((t.total_fees for t in self.trades), Decimal("0"))

        avg_pnl_per_trade = total_pnl / len(pnls)
        avg_pnl_bps = sum((t.net_pnl_bps for t in self.trades), Decimal("0")) / len(
            self.trades
        )

        winning = [p for p in pnls if p > 0]
        win_rate = round(len(winning) / len(pnls) * 100, 2)

        best_trade_pnl = max(pnls)
        worst_trade_pnl = min(pnls)

        # Sharpe estimate: mean / stddev of PnL (requires >= 2 trades)
        if len(pnls) >= 2:
            pnls_float = [float(p) for p in pnls]
            sharpe_estimate = (
                statistics.mean(pnls_float) / statistics.stdev(pnls_float)
                if statistics.stdev(pnls_float) != 0
                else 0.0
            )
        else:
            sharpe_estimate = 0.0

        # PnL grouped by hour
        pnl_by_hour: dict[str, Decimal] = {}
        for t in self.trades:
            hour = t.timestamp.strftime("%Y-%m-%d %H:00")
            pnl_by_hour[hour] = pnl_by_hour.get(hour, Decimal("0")) + t.net_pnl

        return {
            "total_trades": len(self.trades),
            "total_pnl_usd": total_pnl,
            "total_fees_usd": total_fees,
            "avg_pnl_per_trade": avg_pnl_per_trade,
            "avg_pnl_bps": avg_pnl_bps,
            "win_rate": win_rate,
            "best_trade_pnl": best_trade_pnl,
            "worst_trade_pnl": worst_trade_pnl,
            "total_notional": total_notional,
            "sharpe_estimate": sharpe_estimate,
            "pnl_by_hour": pnl_by_hour,
        }

    # ------------------------------------------------------------------ #

    def recent(self, n: int = 10) -> list[dict]:
        """
        Last N trades as summary dicts.
        For display in CLI dashboard.
        """
        if len(self.trades) < n:
            raise ValueError(
                f"Not enough trades recorded (have {len(self.trades)}, need {n})"
            )

        last_trades = sorted(self.trades, key=lambda t: t.timestamp, reverse=True)[:n]

        print("Last trades:")
        rows = []
        for t in last_trades:
            status = "✅" if t.net_pnl > 0 else "❌"
            print(
                f"{t.timestamp.strftime('%H:%M:%S')} {t.buy_leg.symbol} "
                f"Buy {t.buy_leg.venue} / Sell {t.sell_leg.venue} "
                f"${t.net_pnl:.2f} ({t.net_pnl_bps:.2f} bps) {status}"
            )
            rows.append(
                {
                    "id": t.id,
                    "timestamp": t.timestamp,
                    "symbol": t.buy_leg.symbol,
                    "buy_venue": t.buy_leg.venue,
                    "sell_venue": t.sell_leg.venue,
                    "net_pnl": t.net_pnl,
                    "net_pnl_bps": t.net_pnl_bps,
                }
            )
        return rows

    # ------------------------------------------------------------------ #

    def export_csv(self, filepath: str):
        """Export all trades to CSV for analysis."""
        with open(filepath, "w", newline="") as f:
            if not self.trades:
                return

            writer = csv.writer(f)
            writer.writerow(
                [
                    "id",
                    "timestamp",
                    "buy_venue",
                    "buy_symbol",
                    "buy_amount",
                    "buy_price",
                    "buy_fee",
                    "sell_venue",
                    "sell_symbol",
                    "sell_amount",
                    "sell_price",
                    "sell_fee",
                    "gas_usd",
                    "notional",
                    "gross_pnl",
                    "total_fees",
                    "net_pnl",
                    "net_pnl_bps",
                ]
            )
            for t in self.trades:
                writer.writerow(
                    [
                        t.id,
                        t.timestamp.isoformat(),
                        t.buy_leg.venue,
                        t.buy_leg.symbol,
                        t.buy_leg.amount,
                        t.buy_leg.price,
                        t.buy_leg.fee,
                        t.sell_leg.venue,
                        t.sell_leg.symbol,
                        t.sell_leg.amount,
                        t.sell_leg.price,
                        t.sell_leg.fee,
                        t.gas_cost_usd,
                        t.notional,
                        t.gross_pnl,
                        t.total_fees,
                        t.net_pnl,
                        t.net_pnl_bps,
                    ]
                )
