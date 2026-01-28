#!/usr/bin/env node

import process from "node:process";
import ChainClient from "./ChainClient.js";
import TokenAmount from "../core/BaseTypes/TokenAmount.js";

const SELECTORS: Record<string, string> = {
  "0xa9059cbb": "transfer(address,uint256)",
  "0x23b872dd": "transferFrom(address,address,uint256)",
  "0x095ea7b3": "approve(address,uint256)",
  "0x70a08231": "balanceOf(address)",
  "0x18160ddd": "totalSupply()",
  "0xdd62ed3e": "allowance(address,address)",
  "0x313ce567": "decimals()",
  "0x06fdde03": "name()",
  "0x95d89b41": "symbol()",
  //Uniswap V2
  "0x38ed1739":
    "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
  "0x7ff36ab5": "swapExactETHForTokens(uint256,address[],address,uint256)",
  "0x18cbafe5":
    "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
  "0xfb3bdb41": "swapETHForExactTokens(uint256,address[],address,uint256)",
  //Uniswap V3
  "0x414bf389":
    "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
  "0xc04b8d59": "exactInput((bytes,address,uint256,uint256,uint256))",
  //TH
  "0xd0e30db0": "deposit()",
  "0x2e1a7d4d": "withdraw(uint256)",
};
function parseArgs() {
  const [, , txHash, ...rest] = process.argv;

  if (!txHash) {
    console.error("Usage: chain-analyzer <tx_hash> [--rpc URL]");
    process.exit(1);
  }

  let rpc: string | undefined;

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

  console.log("\n");

  console.log("From: " + response?.from);
  console.log("To: " + response?.to);
  console.log(
    "Value: " +
      TokenAmount.fromRaw(
        response?.value ? response?.value : BigInt(0),
        18,
        ".",
      ).toString() +
      " ETH",
  );

  console.log("\n");

  console.log("Gas Analysis");
  console.log("-".repeat(10));
  console.log("Gas Limit: " + response?.gasLimit);
  const percentGasUsed = (
    (Number(receipt?.gasUsed) / Number(response?.gasLimit)) *
    100
  ).toFixed(2);
  const priorityFee =
    Number(receipt?.effectiveGasPrice) - Number(block?.baseFeePerGas);
  const transactionFee =
    Number(receipt?.effectiveGasPrice) - Number(block?.baseFeePerGas);
  console.log("Gas Used: " + receipt?.gasUsed + ` (${percentGasUsed})`);
  console.log("Base Fee: " + block?.baseFeePerGas + " wei");
  console.log("Priority Fee: " + priorityFee + " wei");
  console.log("Effective Price: " + receipt?.effectiveGasPrice + " wei");
  console.log("Transaction Fee: ", transactionFee);

  console.log("\n");

  console.log("Function Called");
  console.log("-".repeat(10));
  if (response?.data === "0x") {
    console.log("Simple transfer");
  } else {
    const selector = response?.data.slice(0, 10);

    console.log("Selector:", selector);
    console.log("Signature:", SELECTORS[selector ?? ""] ?? "Unknown");
  }
  console.log(receipt);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
