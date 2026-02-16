#!/bin/sh
set -e

# Trap errors and display failure message
trap 'echo "❌ pre-commit checks failed!"; exit 1' ERR

black .
