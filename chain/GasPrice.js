"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var GasPrice = /** @class */ (function () {
    function GasPrice(baseFee, low, medium, high) {
        this.baseFee = baseFee;
        this.priorityFeeLow = low;
        this.priorityFeeMedium = medium;
        this.priorityFeeHigh = high;
    }
    GasPrice.prototype.get_max_fee = function (priority, buffer) {
        if (priority === void 0) { priority = "medium"; }
        if (buffer === void 0) { buffer = 1.2; }
        //Calculate maxFeePerGas with buffer for base fee increase.
        var tip;
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
        var bufferedBase = BigInt(Math.floor(Number(this.baseFee) * buffer));
        return bufferedBase + tip;
    };
    GasPrice.prototype.toString = function () {
        return "GasPrice {\nbaseFee=".concat(this.baseFee, ",\npriorityFeeLow=").concat(this.priorityFeeLow, ",\npriorityFeeMedium=").concat(this.priorityFeeMedium, ",\npriorityFeeHigh=").concat(this.priorityFeeHigh, "\n}");
    };
    return GasPrice;
}());
exports.default = GasPrice;
