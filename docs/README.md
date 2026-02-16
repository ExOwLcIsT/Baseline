# Blockchain Arbitrage Trading System

## Tech Stack

- **Language**: Python (3.14.3)
- **Testing**: pytest
- **Linting**: black
- **Code Formatting**: black
- **Git Hooks**: python-Husky
- **Blockchain**: eth_account, web3

## Project Structure

```
|src
|
├core/
│├── wallet_manager.py        # Wallet creation and management
│├── canonical_serializer.py  # Deterministic serialization
│└── base_types.py
│
├docs/
│├──README.md
├chain/
│├── chain_client.py          # Blockchain RPC client and Gas price tracking
│├── transaction_builder.py   # Transaction construction
│├── transaction_analyzer.py  # On-chain tx analysis CLI
│└── chain_errors.py          # Custom error types
|pricing/
│└── AMM.py                  # UnitswapV2Pair math simulator
│└── fork_simulator.py        # Fork simulator
│└── mempool_monitor.py       # Monitor of memory pool
│└── price_impact_analyzer.py  # Analyzer of the swap prices
│└── pricing_engine.py        # Integration class
│└── route.py                # Route for multi-hop
│└── route_finder.py
│└── token.py                # Class for token
├scripts/
│└── integration_test_script.py      # Integration tests
├tests/
│├── wallet_manager.test.py   # Wallet tests
│└── canonical_serializer.test.py # Serialization tests
├configs/
|
├.husky/                     # Git hooks
├.env.example                # example of .env file
├requirements.txt            # modules to install
```

## Installation

### Prerequisites

- python 3.14
- pip

### Setup

1. Clone the repository:

```bash
git clone https:#github.com/ExOwLcIsT/Baseline.git
cd Baseline
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Create an `.env` file from the example:

```bash
cp .env.example .env
```

4. Configure environment variables:

```
PRIVATE_KEY=<your_wallet_private_key>
INFURA_RPC_URL=https:#<net>.infura.io/v3/<your_api_key>
etc.
```

## Usage

### Run the Application

### Run Tests

```bash
pytest
```

Runs all unit tests with pytest.

### Transaction Analysis

Analyze any blockchain transaction:

```bash
py ./dist/chain/transaction_analyzer 0x<transaction_hash> --rpc https:#<net>.infura.io/v3/<api_key>
```

The analyzer provides:

- Transaction metadata (hash, block, timestamp)
- Sender/recipient information
- ETH value transferred
- Gas analysis and fees
- Function signatures and decoded selectors

# Price Impact Analysis

Analyze price impact after swap

```bash
py -m pricing.price_impact_analyzer <pair_address> --token-in=<Token_symbol> --sizes=<array_of_amount_in_sizes>(1,10,1000)
```

Example:

```bash
py -m scripts.price_impact_analyzer 0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852 --token-in=WETH --sizes=1,2,3,4
```

The analyzer provides:

- Token reserves
- Spot price
- Table with amount out, execution price and price impact in % for every size
- Max trade for 1% impact

## Core Components

### WalletManager

Handles wallet creation, key management, and transaction signing.

```python
# Generate random wallet
wallet = WalletManager.generate()

# Load from environment
wallet = WalletManager.from_env()

# Sign messages
signature = wallet.sign_message("hello")

# Sign typed data (EIP-712)
sig = wallet.sign_typed_data(domain, types, value)

# Sign transactions
rawTx = wallet.sign_transaction(txRequest)
```

### ChainClient

Communicates with blockchain via JSON-RPC.

```python
client = new ChainClient(rpcUrl)
nonce = client.get_monce(address)
receipt = client.get_receipt(txHash)
tx = client.get_transaction(txHash)
```

### CanonicalSerializer

Ensures deterministic JSON serialization for consistent hashing.

```python
serialized = CanonicalSerializer.serialize(obj)
hash = CanonicalSerializer.hash(obj)
isDeterministic = CanonicalSerializer.verify_determinism(obj, iterations)
```

### TransactionBuilder

Constructs and validates blockchain transactions.

```python
tx = TransactionRequest({
  to: Address.fromString("0x..."),
  value: TokenAmount.fromRaw(1000000000000000000, 18),
  chainId: 1,
  gasLimit: 21000,
  maxFeePerGas: 50,
  maxPriorityFee: 2,
})
```

## Configuration

### Environment Variables

```env
# Wallet private key (64 hex characters without 0x prefix)
PRIVATE_KEY=

# Infura RPC endpoint for Ethereum mainnet
INFURA_RPC_URL=https:#mainnet.infura.io/v3/YOUR_API_KEY

# Optional: Alchemy RPC endpoint
ALCHEMY_RPC_URL=

# For memory pool
INFURA_WS_RPC = <URL>

UNISWAP_V2_ROUTER_ADDRESS=
BINANCE_TESTNET_API_KEY=
BINANCE_TESTNET_SECRET=
CHAIN_URL=
UNISWAP_PAIR_ADDRESSES=
BINANCE_WS_URL=
```

## Testing

The project includes comprehensive tests using Vitest:

### WalletManager Tests

- Wallet generation
- Environment loading
- Message signing and verification
- Typed data signing (EIP-712)
- Transaction signing

### CanonicalSerializer Tests

- Alphabetical key sorting
- Keccak256 hashing
- Determinism verification
- Nested object handling

### AMM Tests

- getting amout out
- amount out matches solidity
- integer math without floats
- swap is immutable

### RouteFinder Tests

- getting amout out
- amount out matches solidity
- integer math without floats
- swap is immutable

### RouteFinder Tests

- direct or multihop desides by gas price
- in case of no routes
- route output matches sequential swaps

## Development

### Code Quality

Pre-commit hooks automatically:

Format code with Black

## API Reference

### Address Type

```python
addr = Address.fromString("0x...")
str = addr.toString() # "0x..."
```

### TokenAmount Type

```python
# Create from raw value (wei for ETH)
amount = TokenAmount.fromRaw(1000000000000000000, 18)
console.log(amount.toString()) # "1.0"
```

### Transaction Request

```python
tx = new CustomTransactionRequest({
  to: recipient,
  value: amount,
  chainId: 1,
  nonce: 0,
  gasLimit: 21000,
  maxFeePerGas: 50,
  maxPriorityFee: 2,
})
```

## Supported Networks

- **Ethereum Mainnet** (chainId: 1)
- **Sepolia Testnet** (chainId: 11155111)
- **Any EVM-compatible network** via custom RPC URL

## Acknowledgments
