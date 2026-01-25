class GasPrice {
  // Current gas price information.
  baseFee: bigint;
  priorityFeeLow: bigint;
  priorityFeeMedium: bigint;
  priorityFeeHigh: bigint;

  constructor(baseFee: bigint, low: bigint, medium: bigint, high: bigint) {
    this.baseFee = baseFee;
    this.priorityFeeLow = low;
    this.priorityFeeMedium = medium;
    this.priorityFeeHigh = high;
  }

  getMaxFee(priority: string = "medium", buffer: number = 1.2): bigint {
    //Calculate maxFeePerGas with buffer for base fee increase.
    let tip: bigint;

    switch (priority) {
      case "low":
        tip = this.priorityFeeLow;
        break;
      case "high":
        tip = this.priorityFeeHigh;
        break;
      default:
        tip = this.priorityFeeMedium;
    }

    const bufferedBase = BigInt(Math.floor(Number(this.baseFee) * buffer));

    return bufferedBase + tip;
  }
  toString() {
    return `GasPrice {\nbaseFee=${this.baseFee},\npriorityFeeLow=${this.priorityFeeLow},\npriorityFeeMedium=${this.priorityFeeMedium},\npriorityFeeHigh=${this.priorityFeeHigh}\n}`;
  }
}

export default GasPrice;
