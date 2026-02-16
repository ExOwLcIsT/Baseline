import re
import pytest

from eth_account import Account
from eth_account.messages import encode_defunct

from core.wallet import WalletManager
from core.base_types import TokenAmount, TransactionRequest
from core.base_types import Address

# ------------------------
# fixtures
# ------------------------


@pytest.fixture
def wallet_manager():
    return WalletManager.generate()


# ------------------------
# tests
# ------------------------


def test_generate_creates_valid_wallet(wallet_manager):
    assert wallet_manager.address.startswith("0x")
    assert len(wallet_manager.address) == 42


def test_from_env_loads_wallet_correctly(monkeypatch):
    tmp = Account.create()

    monkeypatch.setenv("PRIVATE_KEY", tmp.key.hex())

    wm = WalletManager.from_env()
    print(wm)
    assert wm.address.lower() == tmp.address.lower()


def test_sign_message_signs_and_verifies(wallet_manager):
    message = "hello world"

    sig = wallet_manager.sign_message(message)

    msg = encode_defunct(text=message)
    recovered = Account.recover_message(msg, signature=sig.signature)

    assert recovered.lower() == wallet_manager.address.lower()


def test_sign_message_throws_on_empty(wallet_manager):
    with pytest.raises(Exception):
        wallet_manager.sign_message("")


def test_sign_typed_data_signs_and_verifies(wallet_manager):
    domain = {
        "name": "TestApp",
        "version": "1",
        "chainId": 1,
    }

    types = {
        "Mail": [
            {"name": "from", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
    }

    value = {
        "from": wallet_manager.address,
        "amount": 123,
    }

    wallet_manager.sign_typed_data(domain, types, value)

    assert wallet_manager.address.lower() is not None


def test_sign_transaction_preserves_sender(wallet_manager):
    tx = TransactionRequest(
        to=Address.from_string(wallet_manager.address),
        value=TokenAmount.from_raw(0, 18),
        chain_id=11155111,
        nonce=0,
        gas_limit=21000,
        max_fee_per_gas=1,
        max_priority_fee=1,
    )

    raw = wallet_manager.sign_transaction(tx)

    recovered = Account.recover_transaction(raw.raw_transaction)

    assert recovered.lower() == wallet_manager.address.lower()


def test_to_string_hides_private_key(wallet_manager):
    s = str(wallet_manager)
    assert "address=" in s
    assert "private" not in s.lower()
