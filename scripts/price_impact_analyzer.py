import sys
import asyncio
from dotenv import load_dotenv
from web3 import Web3
from chain.chain_client import ChainClient
from core.base_types import Address
from pricing.token import Token
from pricing.AMM import UniswapV2Pair
from pricing.price_impact_analyzer import PriceImpactAnalyzer


def parse_arg(flag: str) -> str | None:
    for arg in sys.argv:
        if arg.startswith(flag + "="):
            return arg.split("=")[1]
    return None


def parse_sizes(s: str) -> list[int]:
    return [int(x.strip()) for x in s.split(",")]


def format_number(n: float, digits: int = 4) -> str:
    return f"{n:,.{digits}f}"


async def load_token(addr: str, client: ChainClient) -> Token:
    abi = [
        {
            "constant": True,
            "inputs": [],
            "name": "symbol",
            "outputs": [{"name": "", "type": "string"}],
            "type": "function",
        },
        {
            "constant": True,
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "type": "function",
        },
    ]
    contract = client.w3.eth.contract(address=Web3.to_checksum_address(addr), abi=abi)
    symbol, decimals = await asyncio.to_thread(
        lambda: (
            contract.functions.symbol().call(),
            contract.functions.decimals().call(),
        )
    )
    return Token(symbol, 10**decimals, Address.from_string(addr))


async def main():
    load_dotenv()

    if len(sys.argv) < 2:
        print(
            "Usage: py -m scripts.price_impact_analyzer.py <pair_address> --token-in=USDC --sizes=1000,10000,100000"
        )
        sys.exit(1)

    pair_addr_str = sys.argv[1]
    token_in_symbol = parse_arg("--token-in")
    sizes_arg = parse_arg("--sizes")

    if not pair_addr_str or not token_in_symbol or not sizes_arg:
        print("Missing required arguments")
        sys.exit(1)

    sizes = parse_sizes(sizes_arg)

    client = ChainClient()
    pair_address = Address.from_string(pair_addr_str)

    # Load pair data
    abi = [
        {
            "constant": True,
            "inputs": [],
            "name": "token0",
            "outputs": [{"name": "", "type": "address"}],
            "type": "function",
        },
        {
            "constant": True,
            "inputs": [],
            "name": "token1",
            "outputs": [{"name": "", "type": "address"}],
            "type": "function",
        },
        {
            "constant": True,
            "inputs": [],
            "name": "getReserves",
            "outputs": [
                {"name": "_reserve0", "type": "uint112"},
                {"name": "_reserve1", "type": "uint112"},
                {"name": "_blockTimestampLast", "type": "uint32"},
            ],
            "type": "function",
        },
    ]

    contract = client.w3.eth.contract(
        address=Web3.to_checksum_address(pair_addr_str), abi=abi
    )
    token0_addr, token1_addr, reserves = await asyncio.to_thread(
        lambda: (
            contract.functions.token0().call(),
            contract.functions.token1().call(),
            contract.functions.getReserves().call(),
        )
    )

    token0 = await load_token(token0_addr, client)
    token1 = await load_token(token1_addr, client)

    pair = await UniswapV2Pair.from_chain(address=pair_address, client=client)
    print(pair)
    print(pair.reserve1)
    print(pair.reserve0)
    print(pair.token0.name)
    print(pair.token1.name)
    # Select token_in and token_out
    token_in_symbol = token_in_symbol.upper()
    token_in = (
        token0
        if token_in_symbol == token0.name
        else token1 if token_in_symbol == token1.name else None
    )
    if not token_in:
        raise ValueError(
            f"Token {token_in_symbol} not found in pair ({token0.name}/{token1.name})"
        )

    token_out = token1 if token_in == token0 else token0

    analyzer = PriceImpactAnalyzer(pair)

    # Header
    print(f"\nPrice Impact Analysis for {token_in.name} → {token_out.name}")
    print(f"Pool: {pair_addr_str}")
    print(
        f"Reserves: {format_number(pair.reserve0)} {token0.name} / {format_number(pair.reserve1)} {token1.name}"
    )
    print(
        f"Spot Price: {format_number(pair.get_spot_price(token_in), 6)} {token_in.name}/{token_out.name}\n"
    )

    # Table
    print("-" * 66)
    print(
        f"│ {'In'.rjust(10)} │ {'Out'.rjust(22)} │ {'Exec Price'.rjust(12)} │ {'Impact %'.rjust(9)} │"
    )
    print("-" * 66)

    # Scale sizes by token decimals
    sizes_scaled = [size * token_in.decimals for size in sizes]

    rows = analyzer.generate_impact_table(token_in.name, sizes_scaled)

    for r in rows:
        print(
            f"│ {format_number(r['amount_in']).rjust(10)} │ {format_number(r['amount_out'] / token_out.decimals).rjust(22)} │ {format_number(r['execution_price'], 6).rjust(12)} │ {format_number(r['price_impact_pct'], 4).rjust(9)} │"
        )

    print("-" * 66)

    # Extra info
    max_trade = analyzer.find_max_size_for_impact(token_in, 1)
    print(
        f"\nMax trade for 1% impact: {format_number(max_trade/token_in.decimals)} {token_in.name}\n"
    )


if __name__ == "__main__":
    asyncio.run(main())
