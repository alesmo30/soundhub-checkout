#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"

echo "==> Building web (VITE_API_BASE_URL=/api/v1, VITE_API_MOCKING=false)"
VITE_API_BASE_URL=/api/v1 \
VITE_API_MOCKING=false \
  pnpm --filter @checkout/web build

echo "==> Building API Lambda bundle"
pnpm --filter @checkout/api build:lambda

echo "==> Deploying all stacks (data, backend, frontend)"
echo "    Review the IAM/security-group changes CDK prints before confirming."
cd "$repo_root"
pnpm --filter @checkout/infra exec cdk deploy --all --profile soundhub
