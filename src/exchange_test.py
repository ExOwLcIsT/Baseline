import asyncio
import time

import websockets
from configs.config import BINANCE_CONFIG
from exchange.exchange_client import ExchangeClient
from exchange.order_book import OrderBook


async def main():

    config = BINANCE_CONFIG
    symbol = "ETHUSDT"
    exchange_client = ExchangeClient(config)
    await exchange_client.start()
    ob = exchange_client.fetch_order_book(symbol=symbol.upper(), limit=10)
    print(ob)
    balance = exchange_client.fetch_balance()


if __name__ == "__main__":
    asyncio.run(main())
