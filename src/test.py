import asyncio
from decimal import Decimal
import os
from dotenv import load_dotenv

from chain.chain_client import ChainClient
from core.base_types import Address
from pricing.pricing_engine import PricingEngine
from pricing.token import Token

load_dotenv()

# Creating wallet from environment
# wallet = WalletManager.fromEnv()
# print(wallet.address)
# ChainClient connects to sepolia.infura.io
cc = ChainClient("http://127.0.0.1:8545")

# nonce = await cc.getNonce(Address.from_string(wallet.address))

# print(nonce)
USDCToken = Token(
    "USDC",
    10**6,
    Address.from_string("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
)
ETHToken = Token(
    "WETH",
    10**18,
    Address.from_string("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
)
USDToken = Token(
    "USDT",
    10**6,
    Address.from_string("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
)
SHIB = Token(
    "SHIB",
    10**18,
    Address.from_string("0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE"),
)

# uni =  UniswapV2Pair(
#   ETHToken,
#   USDToken,
#   BigInt(1000 * 10 ** 18),
#   BigInt(2000000 * 10 ** 6),
# )
# uni1 =  UniswapV2Pair(
#   USDCToken,
#   USDToken,
#   BigInt(2000000 * 10 ** 6),
#   BigInt(2000000 * 10 ** 6),
# )
# print(
#   "Amount out for 10_000 USDC: " +
#     uni.getAmountOut(10_000n * 10n ** 6n, USDCToken) +
#     " wei",
# )
# print(
#   "Amount in for 1128017927007915696 wei: " +
#     uni.getAmountIn(1128017927007915696n, ETHToken),
# )
# print("Spot price of USDC: " + uni.getSpotPrice(USDCToken))
# print(
#   "Execution price of USDC: " +
#     uni.getExecutionPrice(10_000n * 10n ** 6n, USDCToken),
# )
# print(
#   "Price impact: " + uni.getPriceImpact(10_000n * 10n ** 6n, USDCToken) + "%",
# )

# print(
#   "Simulated swap: ",
#   uni.simulateSwap(10_000n * 10n ** 6n, USDCToken),
# )
# print(
#   "From chain ",
#   await UniswapV2Pair.fromChain(
#     Address.from_string("0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"),
#     cc,
#   ),
# )

# price_impact_analyzer =  PriceImpactAnalyzer(uni)

# print(price_impact_analyzer.generateImpactTable("ETH", [1, 2, 3, 4, 5]))

# route =  Route([uni, uni1], [ETHToken, USDCToken, USDToken])
# print("Route out: " + route.getOutput(1n * 10n ** 18n))
# print(
#   "Route imtermediate outs: " + route.getIntermediateAmounts(1n * 10n ** 18n),
# )

# monitor =  MempoolMonitor(process.env.INFURA_WS_RPC!, (swap) => {
#   print("Swap detected:", swap)
#   print(`Detected swap: ${swap.dex} ${swap.method}`)
#   print(`${swap.amountIn} → min ${swap.minAmountOut}`)
#   print(` Slippage tolerance: ${swap.slippageTolerance}`)
# })

# await monitor.start()

engine = PricingEngine(cc, "http://127.0.0.1:8545", os.getenv("INFURA_WS_RPC"))
asyncio.run(
    engine.load_pools(
        [
            Address.from_string(
                "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"
            ),  # WETH/USDC
            Address.from_string(
                "0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852"
            ),  # WETH/USDT
            Address.from_string(
                "0x3041cbd36888becc7bbcbc0045e3b1f144466f5f"
            ),  # USDC/USDT
        ]
    )
)

# engine.swap(Decimal(0.1), ETHToken, USDCToken)
quote = engine.get_quote(ETHToken, USDToken, 2 * 10**18, 0)
print(quote.__dict__)
# quote = await engine.getQuote(
#   ETHToken,
#   USDToken,
#   1_000_000_000_000n,
#   0n,
#   Address.from_string("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
# )
# print(quote)

# engine.monitor.start()

# cl = await ExchangeClient.fromConfig(BINANCE_CONFIG)
# book = await cl.fetchOrderBook("ETH/USDT")
# analyzer =  OrderBookAnalyzer(book)
# #print(analyzer.walkTheBook("buy",  Decimal(110)))
# balance = await cl.fetchBalance()
# analyzer.imbalance()
# it =  InventoryTracker()
# it.updateFromCex(Venue.BINANCE, balance)
# print(it.snapshot())
