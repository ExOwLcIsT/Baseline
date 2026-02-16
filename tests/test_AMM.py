import pytest

from core.base_types import Address
from pricing.token import Token
from pricing.AMM import UniswapV2Pair


USDCToken = Token(
    "USDC",
    10 ** 6,
    Address.from_string("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
)

ETHToken = Token(
    "ETH",
    10 ** 18,
    Address.from_string("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
)


def test_get_basic_amount_out():
    # 1000 ETH / 2M USDC pool, buy 1 ETH worth
    pair = UniswapV2Pair(
        Address.from_string("0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"),
        ETHToken,
        USDCToken,
        1000 * 10**18,
        2_000_000 * 10**6,
    )

    usdc_in = 2000 * 10**6
    eth_out = pair.get_amount_out(usdc_in, USDCToken)

    assert eth_out == 996006981039903216


def test_amount_out_matches_solidity():
    # real historical swap comparison
    pair = UniswapV2Pair(
        Address.from_string("0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"),
        ETHToken,
        USDCToken,
        int(3861.69752193 * 10**18),
        int(10561414.261179 * 10**6),
    )

    eth_in = 72903581224916300
    usdc_out = pair.get_amount_out(eth_in, ETHToken)

    assert usdc_out == 198783196


def test_get_amount_in():
    pair = UniswapV2Pair(
        Address.from_string("0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"),
        ETHToken,
        USDCToken,
        1000 * 10**18,
        2_000_000 * 10**6,
    )

    eth_out = 996006981039903216
    usdc_in = pair.get_amount_in(eth_out, ETHToken)

    assert usdc_in == 2000 * 10**6


def test_integer_math_no_floats():
    pair = UniswapV2Pair(
        Address.from_string("0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"),
        USDCToken,
        ETHToken,
        1000 * 10**300,
        2_000_000 * 10**288,
    )

    usdc_in = (2**53 - 1) * 10**6
    out = pair.get_amount_out(usdc_in, USDCToken)

    assert out == 17960355313953


def test_swap_is_immutable():
    pair = UniswapV2Pair(
        Address.from_string("0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc"),
        ETHToken,
        USDCToken,
        2_000_000,
        1000,
    )

    original_reserve = pair.reserve0
    new_pair = pair.simulate_swap(10 * 10**18, ETHToken)

    assert pair.reserve0 == original_reserve
    assert new_pair.reserve0 != original_reserve
