#!/usr/bin/env bash
# Integration test runner: create a disposable Neon branch (copy-on-write fork of
# production), run *.itest.ts against it, delete the branch — always, even on
# failure. Usage: npm run test:integration
set -euo pipefail
cd "$(dirname "$0")/.."

echo "creating disposable Neon branch..."
BRANCH_JSON=$(npx tsx scripts/neon-branch.ts create)
BRANCH_ID=$(echo "$BRANCH_JSON" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).branchId))")
CONN=$(echo "$BRANCH_JSON" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).connectionString))")
echo "branch: $BRANCH_ID"

cleanup() {
  echo "deleting branch $BRANCH_ID..."
  npx tsx scripts/neon-branch.ts delete "$BRANCH_ID" || echo "WARNING: branch delete failed — remove $BRANCH_ID manually in the Neon console"
}
trap cleanup EXIT

INTEGRATION_DATABASE_URL="$CONN" npx vitest run --config vitest.integration.config.ts
