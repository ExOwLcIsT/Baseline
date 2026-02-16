#!/usr/bin/env python3

import os
import sys
from datetime import datetime
from web3 import Web3
from core.base_types import TokenAmount

SELECTORS = {
    "0xa9059cbb": "transfer(address,uint256)",
    "0x23b872dd": "transferFrom(address,address,uint256)",
    "0x095ea7b3": "approve(address,uint256)",
    "0x70a08231": "balanceOf(address)",
    "0x18160ddd": "totalSupply()",
    "0xdd62ed3e": "allowance(address,address)",
    "0x313ce567": "decimals()",
    "0x06fdde03": "name()",
    "0x95d89b41": "symbol()",
    # Uniswap V2
    "0x38ed1739": "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
    "0x7ff36ab5": "swapExactETHForTokens(uint256,address[],address,uint256)",
    "0x18cbafe5": "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
    "0xfb3bdb41": "swapETHForExactTokens(uint256,address[],address,uint256)",
    # Uniswap V3
    "0x414bf389": "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
    "0xc04b8d59": "exactInput((bytes,address,uint256,uint256,uint256))",
    # WETH
    "0xd0e30db0": "deposit()",
    "0x2e1a7d4d": "withdraw(uint256)",
}


def parse_args():
    if len(sys.argv) < 2:
        print("Usage: py -m chain.transaction_analyzer <tx_hash> [--rpc URL]")
        sys.exit(1)

    tx_hash = sys.argv[1]
    rpc = None

    if "--rpc" in sys.argv:
        idx = sys.argv.index("--rpc")
        if idx + 1 < len(sys.argv):
            rpc = sys.argv[idx + 1]

    if not rpc:
        rpc = os.getenv("INFURA_RPC_URL")

    if not rpc:
        raise RuntimeError("RPC URL not provided")

    return tx_hash, rpc


def main():
    print(sys.argv)
    tx_hash, rpc = parse_args()

    w3 = Web3(Web3.HTTPProvider(rpc))

    print("Transaction Analysis")
    print("=" * 10, "\n")

    receipt = w3.eth.get_transaction_receipt(tx_hash)
    tx = w3.eth.get_transaction(tx_hash)
    block = w3.eth.get_block(tx.blockNumber)

    # --- basic info ---
    print("Hash:", receipt.transactionHash.hex())
    print("Block:", block.number)
    print("Timestamp:", datetime.utcfromtimestamp(block.timestamp))
    print("Status:", "success" if receipt.status == 1 else "failed")
    print()

    print("From:", tx["from"])
    print("To:", tx.to)

    value = tx.value if tx.value else 0
    print("Value:", TokenAmount.from_raw(value, 18, "WETH"))
    print()

    # --- gas analysis ---
    print("Gas Analysis")
    print("-" * 10)

    gas_limit = tx.gas
    gas_used = receipt.gasUsed

    percent_used = (gas_used / gas_limit) * 100 if gas_limit else 0

    base_fee = block.get("baseFeePerGas", 0)
    effective_price = receipt.effectiveGasPrice
    priority_fee = effective_price - base_fee
    tx_fee = gas_used * effective_price

    print("Gas Limit:", gas_limit)
    print(f"Gas Used: {gas_used} ({percent_used:.2f}%)")
    print("Base Fee:", base_fee, "wei")
    print("Priority Fee:", priority_fee, "wei")
    print("Effective Price:", effective_price, "wei")
    print("Transaction Fee:", tx_fee, "wei")
    print()

    # --- selector ---
    print("Function Called")
    print("-" * 10)

    data = tx.input

    if data == "0x":
        print("Simple transfer")
    else:
        selector = data[:10]
        print("Selector:", selector)
        print("Signature:", SELECTORS.get(selector, "Unknown"))

    print("\nFull receipt:")
    print(receipt)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Error:", e)
        sys.exit(1)
