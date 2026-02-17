from decimal import Decimal


class Order:
    id: str
    symbol: str
    side: str
    type: str
    time_in_force: str
    amount_requested: Decimal
    amount_filled: Decimal
    avg_fill_price: Decimal
    fee: Decimal
    fee_asset: str
    status: str
    timestamp: int

    def __init__(self, ccxt_order: dict):
        self.id = str(ccxt_order.get("id", ""))
        self.symbol = ccxt_order.get("symbol", "")
        self.side = str(ccxt_order.get("side", ""))
        self.type = str(ccxt_order.get("type", ""))
        self.time_in_force = str(ccxt_order.get("timeInForce", ""))
        self.amount_requested = Decimal(str(ccxt_order.get("amount", 0)))
        self.amount_filled = Decimal(str(ccxt_order.get("filled", 0)))
        self.avg_fill_price = Decimal(str(ccxt_order.get("average", 0) or 0))
        self.timestamp = ccxt_order.get("timestamp", 0)
        self.status = str(ccxt_order.get("status", ""))

        fee = ccxt_order.get("fee") or {}
        self.fee = Decimal(str(fee.get("cost", 0) or 0))
        self.fee_asset = str(fee.get("currency", ""))

    def __repr__(self):
        return (
            f"Order(id={self.id}, symbol={self.symbol}, side={self.side}, "
            f"status={self.status}, filled={self.amount_filled}/{self.amount_requested} "
            f"@ {self.avg_fill_price})"
        )
