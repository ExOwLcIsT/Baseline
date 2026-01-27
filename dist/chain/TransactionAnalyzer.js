#!/usr/bin/env node
import process from "node:process";
import ChainClient from "./ChainClient.js";
function parseArgs() {
    const [, , txHash, ...rest] = process.argv;
    if (!txHash) {
        console.error("Usage: chain-analyzer <tx_hash> [--rpc URL]");
        process.exit(1);
    }
    let rpc;
    for (let i = 0; i < rest.length; i++) {
        if (rest[i] === "--rpc") {
            rpc = rest[i + 1];
            i++;
        }
    }
    if (!rpc) {
        rpc = process.env["INFURA_RPC_URL"];
    }
    return { txHash, rpc };
}
async function main() {
    const { txHash, rpc } = parseArgs();
    const cc = new ChainClient(rpc);
    console.log("Transaction Analysis");
    console.log("=".repeat(10) + "\n");
    const receipt = await cc.getReceipt(txHash);
    const response = await cc.getTransaction(txHash);
    const block = await response?.getBlock();
    console.log("Hash: " + receipt?.txHash);
    console.log("Block: " + block?.number);
    console.log("Timestamp: " + block?.date);
    console.log("Status: " + receipt?.status ? "success" : "failed");
    console.log("\n".repeat(3));
    console.log("From: " + response?.from);
    console.log("To: " + response?.to);
    console.log("Value: " + response?.value);
    console.log("Gas Analysis");
    console.log("-".repeat(10));
    console.log("Gas Limit: " + response?.gasLimit);
    const percentGasUsed = ((Number(receipt?.gasUsed) / Number(response?.gasLimit)) *
        100).toFixed(2);
    const priorityFee = Number(receipt?.effectiveGasPrice) - Number(block?.baseFeePerGas);
    const transactionFee = Number(receipt?.effectiveGasPrice) - Number(block?.baseFeePerGas);
    console.log("Gas Used: " + receipt?.gasUsed + ` (${percentGasUsed})`);
    console.log("Base Fee: " + block?.baseFeePerGas + "gwei");
    console.log("Priority Fee: " + priorityFee + "gwei");
    console.log("Effective Price: " + receipt?.effectiveGasPrice + "gwei");
    console.log("Transaction Fee: ", transactionFee);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
