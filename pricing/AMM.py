import asyncio
from decimal import Decimal

from web3 import Web3
from chain.chain_client import ChainClient
from core.base_types import Address
from pricing.token import Token


class UniswapV2Pair:
    """
    Represents a Uniswap V2 liquidity pair.
    All math uses integers only — no floats anywhere.
    """

    def __init__(
        self,
        address: Address,
        token0: Token,
        token1: Token,
        reserve0: int,
        reserve1: int,
        fee_bps: int = 30,  # 0.30% = 30 basis points
    ):
        self.address = address
        self.token0 = token0
        self.token1 = token1
        self.reserve0 = reserve0
        self.reserve1 = reserve1
        self.feeBPS = fee_bps

    def get_amount_out(self, amount_in: int, token_in: Token) -> int:
        """
        Calculate output amount for a given input.
        Must match Solidity exactly:

        amount_in_with_fee = amount_in * (10000 - fee_bps)
        numerator = amount_in_with_fee * reserve_out
        denominator = reserve_in * 10000 + amount_in_with_fee
        amount_out = numerator # denominator
        """
        if not (token_in.__eq__(self.token0)) and (not token_in.__eq__(self.token1)):
            raise Exception("Invalid token")
        direction = token_in.__eq__(self.token0)
        amountInWithFee = amount_in * (10000 - self.feeBPS)
        # Reserve that is increased (with counted fee)
        reserveIn = self.reserve0 if direction else self.reserve1
        # Reserve that is decreased
        reserveOut = self.reserve1 if direction else self.reserve0
        numenator = reserveOut * amountInWithFee
        denumenator = reserveIn * 10000 + amountInWithFee
        amount_out = numenator // denumenator
        return amount_out

    def get_amount_in(self, amount_out: int, token_out: Token) -> int:
        """
        Calculate required input for desired output.
        (Inverse of get_amount_out)
        """
        if not token_out.__eq__(self.token0) and not token_out.__eq__(self.token1):
            raise Exception("Invalid token")

        direction = token_out.__eq__(self.token0)

        # Reserve that is increased(with counted fee)
        reserveIn = self.reserve1 if direction else self.reserve0
        # Reserve that is decreased
        reserveOut = self.reserve0 if direction else self.reserve1

        numenator = reserveIn * 10000 * amount_out
        denumenator = reserveOut - amount_out

        amountInWithFee = numenator // denumenator
        amount_in = amountInWithFee // (10000 - self.feeBPS) + 1

        return amount_in

    def get_spot_price(self, token_in: Token) -> Decimal:
        """
        Returns spot price (for display only, not calculations).
        """
        if not token_in.__eq__(self.token0) and not token_in.__eq__(self.token1):
            raise Exception("Invalid token")

        direction = token_in.__eq__(self.token0)
        num = (
            (self.reserve0) / (self.token0.decimals)
            if direction
            else (self.reserve1) / (self.token1.decimals)
        )

        denum = (
            (self.reserve1) / (self.token1.decimals)
            if direction
            else (self.reserve0) / (self.token0.decimals)
        )

        return num / denum

    def get_execution_price(self, amount_in: int, token_in: Token) -> Decimal:
        """
        Returns actual execution price for given trade size.
        """
        if not token_in.__eq__(self.token0) and not token_in.__eq__(self.token1):
            raise Exception("Invalid token")
        amountInNumber = (amount_in) / (token_in.decimals)
        amount_out = self.get_amount_out(amount_in, token_in) / (
            self.token1.decimals
            if token_in.__eq__(self.token0)
            else self.token0.decimals
        )

        executionPrice = amountInNumber / amount_out
        return executionPrice

    def get_price_impact(self, amount_in: int, token_in: Token) -> Decimal:
        """
        Returns price impact as a decimal (0.01 = 1%).
        """
        if not token_in.__eq__(self.token0) and not token_in.__eq__(self.token1):
            raise Exception("Invalid token")
        spotPrice = self.get_spot_price(token_in)
        executionPrice = self.get_execution_price(amount_in, token_in)
        return round(((executionPrice - spotPrice) / spotPrice) * 10000) / 100

    def simulate_swap(self, amount_in: int, token_in: Token) -> "UniswapV2Pair":
        """
        Returns a NEW pair with updated reserves after the swap.
        (Useful for multi-hop simulation)
        """
        if not token_in.__eq__(self.token0) and not token_in.__eq__(self.token1):
            raise Exception("Invalid token")

        direction = token_in.__eq__(self.token0)
        copy = self.copy()
        amount_out = self.get_amount_out(amount_in, token_in)
        if direction:
            copy.reserve0 += amount_in
            copy.reserve1 -= amount_out
        else:
            copy.reserve1 += amount_in
            copy.reserve0 -= amount_out

        return copy

    @classmethod
    async def from_chain(cls, address: Address, client: ChainClient) -> "UniswapV2Pair":
        """
        Fetch pair data from on-chain.
        """

        pairAbi = [
            {
                "constant": True,
                "inputs": [],
                "name": "token0",
                "outputs": [{"name": "", "type": "address"}],
                "payable": False,
                "stateMutability": "view",
                "type": "function",
            },
            {
                "constant": True,
                "inputs": [],
                "name": "token1",
                "outputs": [{"name": "", "type": "address"}],
                "payable": False,
                "stateMutability": "view",
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
                "payable": False,
                "stateMutability": "view",
                "type": "function",
            },
        ]

        erc20Abi = [
            {
                "constant": True,
                "inputs": [],
                "name": "name",
                "outputs": [{"name": "", "type": "string"}],
                "payable": False,
                "stateMutability": "view",
                "type": "function",
            },
            {
                "constant": True,
                "inputs": [],
                "name": "symbol",
                "outputs": [{"name": "", "type": "string"}],
                "payable": False,
                "stateMutability": "view",
                "type": "function",
            },
            {
                "constant": True,
                "inputs": [],
                "name": "decimals",
                "outputs": [{"name": "", "type": "uint8"}],
                "payable": False,
                "stateMutability": "view",
                "type": "function",
            },
        ]

        pair = client.w3.eth.contract(address=address.checksum, abi=pairAbi)

        # -------------------
        # fetch pair data
        # -------------------
        addr0 = pair.functions.token0().call()
        addr1 = pair.functions.token1().call()
        reserves = pair.functions.getReserves().call()
        reserve0 = reserves[0]
        reserve1 = reserves[1]

        # -------------------
        # fetch token metadata
        # -------------------
        token0Contract = client.w3.eth.contract(address=addr0, abi=erc20Abi)
        token1Contract = client.w3.eth.contract(address=addr1, abi=erc20Abi)

        symbol0 = (token0Contract.functions.symbol().call(),)
        decimals0 = (token0Contract.functions.decimals().call(),)

        symbol1 = (token1Contract.functions.symbol().call(),)
        decimals1 = (token1Contract.functions.decimals().call(),)
        # -------------------
        # build tokens
        # -------------------
        token0 = Token(
            name=symbol0[0],
            decimals=10 ** decimals0[0],
            address=Address.from_string(addr0),
        )

        token1 = Token(
            name=symbol1[0],
            decimals=10 ** decimals1[0],
            address=Address.from_string(addr1),
        )
        # -------------------
        # return pair
        # -------------------
        return UniswapV2Pair(address, token0, token1, reserve0, reserve1)

    def refresh_reserves(self, client: ChainClient):
        return UniswapV2Pair.from_chain(self.address, client)

    def copy(self) -> UniswapV2Pair:
        copy = UniswapV2Pair(
            self.address,
            self.token0,
            self.token1,
            self.reserve0,
            self.reserve1,
            self.feeBPS,
        )
        return copy
