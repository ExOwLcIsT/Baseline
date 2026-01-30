#!/bin/bash
# scripts/start_fork.sh

# Requires: anvil (from foundry)
# Install: curl -L <https://foundry.paradigm.xyz> | bash && foundryup
set -a
source .env
set +a
anvil \
    --fork-url "$INFURA_RPC_URL" \
    --fork-block-number 24346754 \
    --port 8545 \
    --accounts 10 \
    --balance 10000