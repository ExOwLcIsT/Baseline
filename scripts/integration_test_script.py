# Creating wallet from environment
from chain.chain_client import ChainClient
from chain.transaction_builder import TransactionBuilder
from core.base_types import Address, TokenAmount, TransactionRequest
from core.wallet import WalletManager
from dotenv import load_dotenv

load_dotenv()

wallet = WalletManager.from_env()

# ChainClient connects to sepolia.infura.io
cc = ChainClient()

# Check balance
balance = cc.get_balance(Address.from_string(wallet.address))
print("Balance: " + str(balance.human) + " ETH")

testAddress = "0x6fd2Dc35ABb024E713fce658f9B811705106e461"

nonce = cc.get_nonce(Address.from_string(wallet.address))
gasPrice = cc.get_gas_price()
print("Nonce: ", nonce)
print("GasPrice: ", gasPrice)
tx_builder = TransactionBuilder(cc, wallet)
tx = tx_builder.to(Address.from_string(testAddress)).value(TokenAmount.from_raw(
    1, 18, ".")).data("0x").nonce(nonce).with_gas_estimate().with_gas_price().chain_id(1).build()


estimatedGas = cc.estimate_gas(tx)
print("Estimated gas: ", estimatedGas)

signedTx = wallet.sign_transaction(tx)

txHash = cc.send_transaction(signedTx)

print("Transaction hash: ", txHash)
