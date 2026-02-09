#!/bin/bash
# scripts/start_fork.sh

# Requires: anvil (from foundry)
# Install: curl -L <https://foundry.paradigm.xyz> | bash && foundryup
set -a
source .env
set +a
anvil \
    --fork-url "$INFURA_RPC_URL" \
    --hardfork london \
    #--fork-block-number 11000000 \
    --fork-block-number 24414968 \
    --port 8545 \
    --accounts 10 \
    --balance 10000
