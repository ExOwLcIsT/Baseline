"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var TokenAmount_js_1 = require("../core/BaseTypes/TokenAmount.js");
var ethers_1 = require("ethers");
var GasPrice_js_1 = require("./GasPrice.js");
var ChainClient = /** @class */ (function () {
    function ChainClient(rpc_url, timeout, max_retries) {
        if (timeout === void 0) { timeout = 30; }
        if (max_retries === void 0) { max_retries = 3; }
        if (!rpc_url) {
            rpc_url = process.env["INFURA_RPC_URL"];
            if (!rpc_url) {
                throw Error("No RPC URL provided. Set INFURA_RPC_URL environment variable or pass rpc_url parameter.");
            }
        }
        var connected = false;
        this.provider = new ethers_1.JsonRpcProvider(rpc_url);
        for (var i = 0; i < max_retries; i++) {
            try {
                this.provider.getBlockNumber();
                connected = true;
                break;
            }
            catch (err) {
                if (i === max_retries - 1) {
                    throw new Error("Failed to connect to ".concat(rpc_url));
                }
                this.provider = new ethers_1.JsonRpcProvider(rpc_url);
            }
        }
    }
    ChainClient.prototype.getBalance = function (address) {
        return __awaiter(this, void 0, void 0, function () {
            var balance;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.provider.getBalance(address.lower)];
                    case 1:
                        balance = _a.sent();
                        console.log(balance);
                        return [2 /*return*/, TokenAmount_js_1.default.fromRaw(balance, 18, ",")];
                }
            });
        });
    };
    ChainClient.prototype.getNonce = function (address_1) {
        return __awaiter(this, arguments, void 0, function (address, block) {
            var nonce;
            if (block === void 0) { block = "pending"; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.provider.getTransactionCount(address.lower, block)];
                    case 1:
                        nonce = _a.sent();
                        return [2 /*return*/, nonce];
                }
            });
        });
    };
    ChainClient.prototype.getGasPrice = function () {
        return __awaiter(this, void 0, void 0, function () {
            var block, feeData, base, priority;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.provider.getBlock("latest")];
                    case 1:
                        block = _a.sent();
                        return [4 /*yield*/, this.provider.getFeeData()];
                    case 2:
                        feeData = _a.sent();
                        if (!(block === null || block === void 0 ? void 0 : block.baseFeePerGas) || !feeData.maxPriorityFeePerGas) {
                            throw new Error("Network does not support EIP-1559");
                        }
                        base = block.baseFeePerGas;
                        priority = feeData.maxPriorityFeePerGas;
                        return [2 /*return*/, new GasPrice_js_1.default(base, priority / 2n, // low
                            priority, // medium
                            priority * 2n)];
                }
            });
        });
    };
    ChainClient.prototype.estimateGas = function (tx) {
        return __awaiter(this, void 0, void 0, function () {
            var estimatedGas;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.provider.estimateGas(tx.toDict())];
                    case 1:
                        estimatedGas = _a.sent();
                        return [2 /*return*/, estimatedGas];
                }
            });
        });
    };
    ChainClient.prototype.sendTransaction = function (signed_tx) {
        return __awaiter(this, void 0, void 0, function () {
            var res, txHash;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.provider.broadcastTransaction(signed_tx)];
                    case 1:
                        res = _a.sent();
                        txHash = res.hash;
                        return [2 /*return*/, txHash];
                }
            });
        });
    };
    ChainClient.prototype.wait_for_receipt = function (tx_hash_1) {
        return __awaiter(this, arguments, void 0, function (tx_hash, timeout) {
            var timeout_seconds, confirms, receipt;
            if (timeout === void 0) { timeout = 120; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        timeout_seconds = timeout * 1000;
                        confirms = 1;
                        return [4 /*yield*/, this.provider.waitForTransaction(tx_hash, confirms, timeout_seconds)];
                    case 1:
                        receipt = _a.sent();
                        return [2 /*return*/, receipt];
                }
            });
        });
    };
    ChainClient.prototype.get_transaction = function (tx_hash) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.provider.getTransaction(tx_hash)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                }
            });
        });
    };
    ChainClient.prototype.get_receipt = function (tx_hash) {
        return __awaiter(this, void 0, void 0, function () {
            var receipt;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.provider.getTransactionReceipt(tx_hash)];
                    case 1:
                        receipt = _a.sent();
                        return [2 /*return*/, receipt];
                }
            });
        });
    };
    ChainClient.prototype.call = function (tx) {
        return __awaiter(this, void 0, void 0, function () {
            var res;
            return __generator(this, function (_a) {
                res = this.provider.call(tx.toDict());
                return [2 /*return*/, res];
            });
        });
    };
    return ChainClient;
}());
exports.default = ChainClient;
