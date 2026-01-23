class GasPrice {
    // Current gas price information.
    baseFee;
    priorityFeeLow;
    priorityFeeMedium;
    priorityFeeHigh;
    constructor(baseFee, low, medium, high) {
        this.baseFee = baseFee;
        this.priorityFeeLow = low;
        this.priorityFeeMedium = medium;
        this.priorityFeeHigh = high;
    }
    get_max_fee(priority = "medium", buffer = 1.2) {
        //Calculate maxFeePerGas with buffer for base fee increase.
        let tip;
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
