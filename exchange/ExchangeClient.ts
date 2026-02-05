import ccxt, { Exchange, TradingFees } from "ccxt";
import Order from "./Order.js";
import OrderBook from "./OrderBook.js";
import { Decimal } from "decimal.js";
export default class ExchangeClient {
  /*
    Wrapper around ccxt for Binance testnet.
    Handles rate limiting, error handling, and response normalization.
    */
  exchange: Exchange;
  rateLimiter: RateLimiter;
  private constructor(config: any) {
    /*
        Initialize with config dict containing apiKey, secret, sandbox flag.
        */
    const exchangeId = "binance";
    const exchangeClass = ccxt[exchangeId];
    this.exchange = new exchangeClass({
      apiKey: config.apiKey,
      secret: config.secret,
      sandbox: config.sandbox,
      options: config.options,
      enableRateLimit: config.enableRateLimit,
    });
    this.rateLimiter = new RateLimiter();
  }

  static async fromConfig(config: any): Promise<ExchangeClient> {
    const client = new ExchangeClient(config);
    try {
      await client.exchange.fetchTime();
      return client;
    } catch (error) {
      throw error;
    }
  }

  async callAPI<T>(
    name: string,
    weight: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!this.rateLimiter.canRequest(weight)) {
      throw "Request blocked";
    }
    this.rateLimiter.record(weight);
    const start = Date.now();
    try {
      const res = await fn();

      console.log(`[EXCHANGE] ${name} ok (${Date.now() - start}ms)`);

      return res;
    } catch (err: any) {
      console.error(`[EXCHANGE] ${name} failed`, err?.message);

      if (
        err instanceof ccxt.NetworkError ||
        err instanceof ccxt.ExchangeNotAvailable
      ) {
        throw new Error(`Network error: ${err.message}`);
      }

      if (err instanceof ccxt.AuthenticationError) {
        throw new Error(`Auth error: ${err.message}`);
      }

      if (
        err instanceof ccxt.RateLimitExceeded ||
        err?.message?.includes("429")
      ) {
        console.log("RateLimitExceeded");
      }

      throw err;
    }
  }

  async fetchOrderBook(
    symbol: string, // "ETH/USDT"
    limit: number = 20, // Number of price levels
  ): Promise<OrderBook> {
    /*
        Fetch L2 order book snapshot.
        */
    const cctxOrderBook = await this.callAPI("fetchOrderBook", 1, () =>
      this.exchange.fetchOrderBook(symbol, limit),
    );
    const orderBook = new OrderBook(
      symbol,
      Number(cctxOrderBook.timestamp),
      cctxOrderBook.bids,
      cctxOrderBook.asks,
    );
    return orderBook;
  }
  async fetchBalance(): Promise<{
    [id: string]: { free: Decimal; total: Decimal; used: Decimal };
  }> {
    /*
        Fetch account balances.

        Returns:
        {
            'ETH':  {'free': Decimal('10.5'), 'locked': Decimal('0'), 'total': Decimal('10.5')},
            'USDT': {'free': Decimal('20000'), 'locked': Decimal('500'), 'total': Decimal('20500')},
            
        }

        Must filter out zero-balance assets.
        */
    const balances = await this.callAPI("fetchBalance", 1, () =>
      this.exchange.fetchBalance(),
    );
    const nonZero: {
      [id: string]: { free: Decimal; total: Decimal; used: Decimal };
    } = {};
    const keys: string[] = Object.keys(balances);
    for (let i = 0; i < keys.length; i++) {
      const balance = balances[keys[i]];
      if (!balance) continue;

      if (balance.total === 0 || isNaN(Number(balance.total))) continue;

      nonZero[keys[i]] = {
        free: new Decimal(Number(balance.free)),
        total: new Decimal(Number(balance.total)),
        used: new Decimal(Number(balance.used)),
      };
    }
    return nonZero;
  }

  async createLimitIocOrder(
    symbol: string, // "ETH/USDT"
    side: string, // "buy" or "sell"
    amount: number, // Quantity of base asset
    price: number, // Limit price
  ): Promise<Order> {
    /*
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
        */
    const cctxOrder = await this.callAPI("createLimitOrder", 1, () =>
      this.exchange.createLimitOrder(symbol, side, amount, price, {
        timeInForce: "IOC",
      }),
    );
    const order = new Order(cctxOrder);
    return order;
  }
  async createMarketOrder(
    symbol: string,
    side: string,
    amount: number,
  ): Promise<Order> {
    /*
        Place a market order. Same return format as create_limit_ioc_order.
        Use sparingly — LIMIT IOC is preferred for arb.
        */
    const cctxOrder = await this.callAPI("createMarketOrder", 1, () =>
      this.exchange.createMarketOrder(symbol, side, amount),
    );
    const order = new Order(cctxOrder);
    return order;
  }
  async cancelOrder(orderId: string, symbol: string): Promise<Order> {
    // Cancel an open order. Returns order status after cancel."""
    const cctxOrder = await this.callAPI("cancelOrder", 1, () =>
      this.exchange.cancelOrder(orderId, symbol),
    );
    const order = new Order(cctxOrder);
    return order;
  }
  async fetchOrderStatus(orderId: string, symbol: string): Promise<string> {
    // Check current status of an order."""
    const orderStatus = await this.callAPI("fetchOrderStatus", 1, () =>
      this.exchange.fetchOrderStatus(orderId, symbol),
    );
    return orderStatus;
  }
  async getTradingFees(symbol: string): Promise<TradingFees | undefined> {
    /*
        Returns fee structure:
        {'maker': Decimal('0.001'), 'taker': Decimal('0.001')}
        */
    const fees = await this.callAPI("fetchTradingFees", 1, () =>
      this.exchange.fetchTradingFees(symbol),
    );
    return fees;
  }
}
class RateLimiter {
  window: [number, number][];
  maxWeight: number;
  constructor(maxWeightPerMin: number = 5000) {
    // 5000, not 6000 — safety margin
    this.window = []; // (timestamp, weight) pairs
    this.maxWeight = maxWeightPerMin;
  }
  canRequest(weight = 1): boolean {
    const now = Date.now() / 1000;
    // Remove entries older than 60s
    while (this.window.length && this.window[0][0] < now - 60) {
      this.window.shift();
    }
    const currentWeight = this.window.reduce(
      (sum, pair) => (sum += pair[1]),
      0,
    );
    return currentWeight + weight <= this.maxWeight;
  }
  record(weight = 1) {
    this.window.push([Date.now() / 1000, weight]);
  }
}
