# chain/pool_fetcher.py

import os
from web3 import Web3

FACTORY_ADDRESS = (
    "0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9"  # Uniswap V2 Factory on Arbitrum
)

WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"  # WETH on Arbitrum
USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"  # USDT on Arbitrum

FACTORY_ABI = [
    {
        "name": "getPair",
        "type": "function",
        "inputs": [
            {"name": "tokenA", "type": "address"},
            {"name": "tokenB", "type": "address"},
        ],
        "outputs": [{"name": "pair", "type": "address"}],
        "stateMutability": "view",
    }
]

PAIR_ABI = [
    {
        "name": "token0",
        "type": "function",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
    },
    {
        "name": "token1",
        "type": "function",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
    },
    {
        "name": "getReserves",
        "type": "function",
        "inputs": [],
        "outputs": [
            {"name": "reserve0", "type": "uint112"},
            {"name": "reserve1", "type": "uint112"},
            {"name": "blockTimestampLast", "type": "uint32"},
        ],
        "stateMutability": "view",
    },
]


def get_pair(
    token_a: str,
    token_b: str,
    rpc_url: str,
    factory_address: str = FACTORY_ADDRESS,
) -> dict:
    """
    Fetch a Uniswap V2 pair address and its reserves from the factory.

    Returns:
    {
        'pair':      '0x...',
        'token0':    '0x...',
        'token1':    '0x...',
        'reserve0':  int,
        'reserve1':  int,
        'timestamp': int,
    }
    """
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise ConnectionError(f"Could not connect to RPC: {rpc_url}")

    factory = w3.eth.contract(
        address=Web3.to_checksum_address(factory_address),
        abi=FACTORY_ABI,
    )

    pair_address = factory.functions.getPair(
        Web3.to_checksum_address(token_a),
        Web3.to_checksum_address(token_b),
    ).call()

    if pair_address == "0x0000000000000000000000000000000000000000":
        raise ValueError(
            f"No pair found for {token_a} / {token_b} on factory {factory_address}"
        )

    pair = w3.eth.contract(
        address=Web3.to_checksum_address(pair_address),
        abi=PAIR_ABI,
    )

    token0 = pair.functions.token0().call()
    token1 = pair.functions.token1().call()
    reserve0, reserve1, timestamp = pair.functions.getReserves().call()

    return {
        "pair": pair_address,
        "token0": token0,
        "token1": token1,
        "reserve0": reserve0,
        "reserve1": reserve1,
        "timestamp": timestamp,
    }


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()

    result = get_pair(WETH, USDT, rpc_url=os.environ["INFURA_RPC_URL"])

    print(f"Pair address : {result['pair']}")
    print(f"Token0       : {result['token0']}")
    print(f"Token1       : {result['token1']}")
    print(f"Reserve0     : {result['reserve0']}")
    print(f"Reserve1     : {result['reserve1']}")
    print(f"Last updated : {result['timestamp']}")
