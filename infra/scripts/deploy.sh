#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"

if [ -f "$repo_root/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$repo_root/.env"
  set +a
fi

if [ -z "${ALARM_EMAIL:-}" ]; then
  echo "Missing deploy variable: ALARM_EMAIL" >&2
  exit 1
fi

echo "==> Building web (VITE_API_BASE_URL=/api/v1, VITE_API_MOCKING=false)"
VITE_API_BASE_URL=/api/v1 \
VITE_API_MOCKING=false \
  pnpm --filter @checkout/web build

echo "==> Building API Lambda bundle"
pnpm --filter @checkout/api build:lambda

echo "==> Deploying all stacks (data, backend, frontend)"
echo "    Review the IAM/security-group changes CDK prints before confirming."
cd "$repo_root"
pnpm --filter @checkout/infra exec cdk deploy --all --profile soundhub \
  --parameters "CheckoutBackendStack:AlarmEmail=${ALARM_EMAIL}"
