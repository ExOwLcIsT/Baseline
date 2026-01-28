# Blockchain Arbitrage Trading System

## Tech Stack

- **Language**: TypeScript (ES2022)
- **Runtime**: Node.js with ES Modules
- **Testing**: Vitest
- **Linting**: ESLint with TypeScript support
- **Code Formatting**: Prettier
- **Git Hooks**: Husky + lint-staged
- **Blockchain**: ethers.js v6
- **Cryptography**: @noble/secp256k1, @noble/hashes

## Project Structure

```
|src/
│└── main.ts                 # Application entry point
├core/
│├── WalletManager.ts        # Wallet creation and management
│├── CanonicalSerializer.ts  # Deterministic serialization
│└── BaseTypes/
│    ├── Address.ts          # Address type wrapper
│    ├── TokenAmount.ts      # Token amount handling
│    ├── TransactionRequest.ts # Custom transaction type
│    └── TransactionReceipt.ts # Receipt type
├chain/
│├── ChainClient.ts          # Blockchain RPC client
│├── TransactionBuilder.ts   # Transaction construction
│├── TransactionAnalyzer.ts  # On-chain tx analysis CLI
│├── GasPrice.ts             # Gas price tracking
│└── ChainErrors.ts          # Custom error types
├scripts/
│└── integrationTest.ts      # Integration tests
├tests/
│├── WalletManager.test.ts   # Wallet tests
│└── CanonicalSerializer.test.ts # Serialization tests
├configs/
│└── eslint.config.mjs       # ESLint configuration
├.husky/                     # Git hooks
├tsconfig.json               # TypeScript config
├package.json                # required packages
├.env.example                # example of .env file
└README.md
```

## Installation

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone https://github.com/ExOwLcIsT/Baseline.git
cd Baseline
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file from the example:
```bash
cp .env.example .env
```

4. Configure environment variables:
```
PRIVATE_KEY=<your_wallet_private_key>
INFURA_RPC_URL=https://<net>.infura.io/v3/<your_api_key>

```

## Usage

### Build the Project

```bash
npm run build
```

Compiles TypeScript to JavaScript in the `dist/` directory.

### Run the Application

```bash
npm run start
```

Executes the main application with wallet initialization.

### Run Tests

```bash
npm test
```

Runs all unit and integration tests with Vitest.

### Lint Code

```bash
npm run lint
```

Runs ESLint to check code quality.

### Transaction Analysis

Analyze any blockchain transaction:

```bash
node ./dist/chain/TransactionAnalyzer.js 0x<transaction_hash> --rpc https://<net>.infura.io/v3/<api_key>
```

The analyzer provides:
- Transaction metadata (hash, block, timestamp)
- Sender/recipient information
- ETH value transferred
- Gas analysis and fees
- Function signatures and decoded selectors

## Core Components

### WalletManager
Handles wallet creation, key management, and transaction signing.

```typescript
// Generate random wallet
const wallet = WalletManager.generate();

// Load from environment
const wallet = WalletManager.fromEnv();

// Sign messages
const signature = wallet.signMessage("hello");

// Sign typed data (EIP-712)
const sig = await wallet.signTypedData(domain, types, value);

// Sign transactions
const rawTx = await wallet.signTransaction(txRequest);
```

### ChainClient
Communicates with blockchain via JSON-RPC.

```typescript
const client = new ChainClient(rpcUrl);
const nonce = await client.getNonce(address);
const receipt = await client.getReceipt(txHash);
const tx = await client.getTransaction(txHash);
```

### CanonicalSerializer
Ensures deterministic JSON serialization for consistent hashing.

```typescript
const serialized = CanonicalSerializer.serialize(obj);
const hash = CanonicalSerializer.hash(obj);
const isDeterministic = CanonicalSerializer.verify_determinism(obj, iterations);
```

### TransactionBuilder
Constructs and validates blockchain transactions.

```typescript
const tx = new CustomTransactionRequest({
  to: Address.fromString("0x..."),
  value: TokenAmount.fromRaw(1000000000000000000n, 18),
  chainId: 1,
  gasLimit: 21000,
  maxFeePerGas: 50n,
  maxPriorityFee: 2n
});
```

## Configuration

### TypeScript Configuration (`tsconfig.json`)
- **Target**: ES2022
- **Module**: NodeNext
- **Strict Mode**: Enabled
- **Includes**: src, core, chain, scripts
- **Excludes**: node_modules, dist

### ESLint Configuration
Enforces code quality and TypeScript best practices.

### Environment Variables
```env
# Wallet private key (64 hex characters without 0x prefix)
PRIVATE_KEY=

# Infura RPC endpoint for Ethereum mainnet
INFURA_RPC_URL=https://mainnet.infura.io/v3/YOUR_API_KEY

# Optional: Alchemy RPC endpoint
ALCHEMY_RPC_URL=
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

Run tests with coverage:
```bash
npm test -- --coverage
```

## Development

### Code Quality

Pre-commit hooks automatically:
1. Run ESLint with auto-fix
2. Format code with Prettier



## API Reference

### Address Type
```typescript
const addr = Address.fromString("0x...");
const str = addr.toString(); // "0x..."
```

### TokenAmount Type
```typescript
// Create from raw value (wei for ETH)
const amount = TokenAmount.fromRaw(1000000000000000000n, 18);
console.log(amount.toString()); // "1.0"
```

### Transaction Request
```typescript
const tx = new CustomTransactionRequest({
  to: recipient,
  value: amount,
  chainId: 1,
  nonce: 0,
  gasLimit: 21000,
  maxFeePerGas: 50n,
  maxPriorityFee: 2n
});
```

## Supported Networks

- **Ethereum Mainnet** (chainId: 1)
- **Sepolia Testnet** (chainId: 11155111)
- **Any EVM-compatible network** via custom RPC URL

## Acknowledgments

- [ethers.js](https://docs.ethers.org/) - Ethereum library
- [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1) - Cryptography
- [Vitest](https://vitest.dev/) - Testing framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety