# exchange/client.py

import asyncio
import json
import time
from typing import Awaitable, Callable, TypeVar
import ccxt
import websockets
from decimal import Decimal

from exchange.order import Order
from exchange.order_book import OrderBook
from exchange.rate_limiter import RateLimiter

T = TypeVar("T")


class ExchangeClient:
    """
    Wrapper around ccxt for Binance testnet.
    Handles rate limiting, error handling, and response normalization.
    """

    def __init__(self, config: dict):
        """
        Initialize with config dict containing apiKey, secret, sandbox flag.
        Must validate connection on init (fetch server time or status).
        """
        exchangeClass = ccxt.binance
        self.exchange = exchangeClass(
            {
                "apiKey": config.get("apiKey", ""),
                "secret": config.get(
                    "secret",
                ),
                "sandbox": config.get("sandbox", True),
                "options": config.get("options", {}),
                "enableRateLimit": config.get("enableRateLimit", True),
            }
        )

        self.rateLimiter = RateLimiter()
        self.order_books: dict[str, OrderBook] = dict()

    async def start(self):
        asyncio.create_task(self.watch_order_book())

    async def watch_order_book(self):
        async with websockets.connect(
            "wss://stream.binance.com:9443/ws/ethusdt@depth"
        ) as ws:
            async for message in ws:
                print(message)
                data = await ws.recv()
                data_json = json.loads(data)
                symbol = data_json["s"]
                book = OrderBook(
                    symbol,
                    (int)(time.time()),
                    data_json["b"],  # bids
                    data_json["a"],  # asks
                )
                self.order_books[symbol] = book

    def call_API(self, name: str, fn: Callable) -> T:
        if not self.rateLimiter.can_request():
            raise RuntimeError("Request blocked")

        weight = 0
        start = time.time()

        try:
            res = fn()
            weight = int(
                self.exchange.last_response_headers.get("X-Mbx-Used-Weight-1m", 0)
            )
            print(
                f"[EXCHANGE] {name} ok ({(time.time() - start) * 1000:.0f}ms) weight: {weight}"
            )
            return res

        except Exception as err:
            print(f"[EXCHANGE] {name} failed: {err}")

            if isinstance(err, (ccxt.NetworkError, ccxt.ExchangeNotAvailable)):
                raise ConnectionError(f"Network error: {err}") from err

            if isinstance(err, ccxt.AuthenticationError):
                raise PermissionError(f"Auth error: {err}") from err

            if isinstance(err, ccxt.RateLimitExceeded) or "429" in str(err):
                print("RateLimitExceeded")

            raise

        finally:
            self.rateLimiter.record(weight)

    def fetch_order_book_rest(self, symbol: str, depth: int = 20):
        result = self.call_API(
            "fetchOrderBook",
            lambda: self.exchange.fetch_order_book(symbol=symbol, limit=depth),
        )
        ob = OrderBook(
            symbol=symbol,
            timestamp=result.get("timestamp"),
            bids=result.get("bids"),
            asks=result.get("asks"),
        )
        return ob

    def fetch_order_book(
        self, symbol: str, limit: int = 20  # "ETH/USDT"  # Number of price levels
    ) -> OrderBook:
        """
        Fetch L2 order book snapshot.

        Returns normalized dict:
        {
            'symbol': 'ETH/USDT',
            'timestamp': 1706000000000,
            'bids': [(price, qty), ...],  # Sorted best→worst
            'asks': [(price, qty), ...],  # Sorted best→worst
            'best_bid': (price, qty),
            'best_ask': (price, qty),
            'mid_price': Decimal,
            'spread_bps': Decimal,
        }
        """
        order_book: OrderBook = self.order_books.get(symbol)

        if order_book is None:
            return None
        return_order_book = OrderBook(
            symbol,
            order_book.timestamp,
            order_book.bids[:limit],
            order_book.asks[:limit],
        )

        return return_order_book

    def fetch_balance(self) -> dict[str, dict]:
        """
        Fetch account balances.

        Returns:
        {
            'ETH':  {'free': Decimal('10.5'), 'locked': Decimal('0'), 'total': Decimal('10.5')},
            'USDT': {'free': Decimal('20000'), 'locked': Decimal('500'), 'total': Decimal('20500')},
            ...
        }

        Must filter out zero-balance assets.
        """
        result = self.call_API(
            "fetchBalance",
            self.exchange.fetchBalance,
        )
        info = result.get("info")
        balances = info.get("balances", [])
        nonZero: dict[str, dict] = dict()
        for balance in balances:
            if not balance:
                continue

            if balance.get("free", 0) + balance.get("locked", 0) == 0:
                continue
            nonZero[balance.get("asset")] = {
                "free": Decimal(balance["free"]),
                "used": Decimal(balance["locked"]),
            }

        return nonZero

    def create_limit_ioc_order(
        self,
        symbol: str,  # "ETH/USDT"
        side: str,  # "buy" or "sell"
        amount: float,  # Quantity of base asset
        price: float,  # Limit price
    ) -> dict:
        """
        Place a LIMIT IOC (Immediate Or Cancel) order.

        Returns normalized order result:
        {
            'id': str,
            'symbol': str,
            'side': str,
            'type': 'limit',
            'time_in_force': 'IOC',
            'amount_requested': Decimal,
            'amount_filled': Decimal,
            'avg_fill_price': Decimal,
            'fee': Decimal,
            'fee_asset': str,
            'status': str,  # 'filled', 'partially_filled', 'expired'
            'timestamp': int,
        }

        Must handle: partial fills, rejection, and exchange errors.
        """
        cctx_order = self.call_API(
            "createLimitOrder",
            lambda: self.exchange.create_limit_order(
                symbol,
                side,
                amount,
                price,
                {
                    "timeInForce": "IOC",
                },
            ),
        )
        order = Order(cctx_order)
        return order

    def create_market_order(
        self,
        symbol: str,
        side: str,
        amount: float,
    ) -> dict:
        """
        Place a market order. Same return format as create_limit_ioc_order.
        Use sparingly — LIMIT IOC is preferred for arb.
        """
        cctx_order = self.call_API(
            "createMarketOrder",
            lambda: self.exchange.create_market_order(symbol, side, amount),
        )
        order = Order(cctx_order)
        return order

    def cancel_order(self, order_id: str, symbol: str) -> dict:
        """Cancel an open order. Returns order status after cancel."""
        cctx_order = self.call_API(
            "cancelOrder",
            lambda: self.exchange.cancel_order(order_id, symbol),
        )
        order = Order(cctx_order)
        return order

    def fetch_order_status(self, order_id: str, symbol: str) -> dict:
        """Check current status of an order."""
        order_status = self.call_API(
            "fetchOrderStatus",
            lambda: self.exchange.fetch_order_status(order_id, symbol),
        )
        return order_status

    def get_trading_fees(self, symbol: str) -> dict:
        """
        Returns fee structure:
        {'maker': Decimal('0.001'), 'taker': Decimal('0.001')}
        """
        fees = self.call_API(
            "fetchTradingFees",
            lambda: self.exchange.fetch_trading_fees(symbol),
        )
        return fees
