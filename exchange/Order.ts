import { Order as CCTXOrder } from "ccxt";
import { Decimal } from "decimal.js";
export default class Order {
  id: string;
  symbol: string;
  side: string;
  type: string;
  timeInForce: string;
  amountRequested: Decimal;
  amountFilled: Decimal;
  avgFillPrice: Decimal;
  fee: Decimal;
  feeAsset: string;
  status: string;
  timestamp: number;
  /**
   *
   */
  constructor(cctxOrder: CCTXOrder) {
    this.id = cctxOrder.id.toString();
    this.symbol = cctxOrder.symbol;
    this.side = cctxOrder.side?.toString() ?? "";
    this.type = cctxOrder.type?.toString() ?? "";
    this.timeInForce = cctxOrder.timeInForce?.toString() ?? "";
    this.amountRequested = new Decimal(cctxOrder.amount);
    this.amountFilled = new Decimal(cctxOrder.filled);
    this.avgFillPrice = new Decimal(cctxOrder.average ?? 0);
    this.fee = new Decimal(Number(cctxOrder.fee?.cost));
    this.feeAsset = cctxOrder.fee?.currency?.toString() ?? "";
    this.status = cctxOrder.status?.toString() ?? ""; // 'filled', 'partially_filled', 'expired'
    this.timestamp = cctxOrder.timestamp;
  }
}
