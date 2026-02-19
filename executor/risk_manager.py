from dataclasses import dataclass
import time
from executor.risk_limits import RiskLimits
from strategy.signal import Signal


@dataclass
class TradeRecord:
    timestamp: float
    pnl: float
    pair: str


class RiskManager:
    def __init__(self, risk_limits: RiskLimits, initial_capital: float = 100.0):
        self.risk_limits = risk_limits
        self.initial_capital = 100
        self.risk_limits = risk_limits
        self.initial_capital = initial_capital
        self.current_capital = initial_capital

        self.trade_history: list[TradeRecord] = []
        self.open_positions: dict[str, float] = {}
        self.daily_loss: float = 0.0
        self.peak_capital: float = initial_capital
        self.consecutive_losses: int = 0

    def check_pre_trade(self, signal: Signal) -> tuple[bool, str | None]:
        """
        Run all risk checks before allowing a trade.
        Returns (allowed, reason) — reason is None if allowed.
        """
        trade_value = signal.size * signal.cex_price

        # 1. Max trade size in USD
        if trade_value > self.risk_limits.max_trade_usd:
            return (
                False,
                f"Trade value ${trade_value:.2f} exceeds max ${self.risk_limits.max_trade_usd}",
            )

        # 2. Max trade as % of capital
        if trade_value > self.current_capital * self.risk_limits.max_trade_pct:
            pct = trade_value / self.current_capital * 100
            return (
                False,
                f"Trade is {pct:.1f}% of capital, max {self.risk_limits.max_trade_pct * 100:.0f}%",
            )

        # 3. Max position per token
        base = signal.pair.split("/")[0]
        current_exposure = self.open_positions.get(base, 0.0)
        if current_exposure + trade_value > self.risk_limits.max_position_per_token:
            return (
                False,
                f"Position in {base} would exceed max ${self.risk_limits.max_position_per_token}",
            )

        # 4. Max open positions
        if len(self.open_positions) >= self.risk_limits.max_open_positions:
            return (
                False,
                f"Max open positions ({self.risk_limits.max_open_positions}) reached",
            )

        # 5. Max loss per trade (expected)
        if abs(min(signal.expected_net_pnl, 0)) > self.risk_limits.max_loss_per_trade:
            return (
                False,
                f"Expected loss exceeds max per-trade loss ${self.risk_limits.max_loss_per_trade}",
            )

        # 6. Daily loss limit
        if self.daily_loss >= self.risk_limits.max_daily_loss:
            return False, f"Daily loss limit ${self.risk_limits.max_daily_loss} reached"

        # 7. Max drawdown
        drawdown = (self.peak_capital - self.current_capital) / self.peak_capital
        if drawdown >= self.risk_limits.max_drawdown_pct:
            return (
                False,
                f"Drawdown {drawdown*100:.1f}% exceeds max {self.risk_limits.max_drawdown_pct*100:.0f}%",
            )

        # 8. Max trades per hour
        one_hour_ago = time.time() - 3600
        recent_trades = [t for t in self.trade_history if t.timestamp > one_hour_ago]
        if len(recent_trades) >= self.risk_limits.max_trades_per_hour:
            return (
                False,
                f"Max trades per hour ({self.risk_limits.max_trades_per_hour}) reached",
            )

        # 9. Consecutive loss limit
        if self.consecutive_losses >= self.risk_limits.consecutive_loss_limit:
            return (
                False,
                f"Consecutive loss limit ({self.risk_limits.consecutive_loss_limit}) reached",
            )

        return True, None
