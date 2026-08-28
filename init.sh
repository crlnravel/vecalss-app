#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
RESOURCE_GUARD="$SCRIPT_DIR/_harness/resource-guard.sh"

if [ ! -x "$RESOURCE_GUARD" ]; then
  echo "Missing executable resource guard: $RESOURCE_GUARD" >&2
  exit 1
fi

echo "=== Harness Initialization ==="

if [ ! -f "$SCRIPT_DIR/node_modules/.modules.yaml" ] || \
  [ "$SCRIPT_DIR/package.json" -nt "$SCRIPT_DIR/node_modules/.modules.yaml" ] || \
  [ "$SCRIPT_DIR/pnpm-lock.yaml" -nt "$SCRIPT_DIR/node_modules/.modules.yaml" ]; then
  echo "=== guarded pnpm install ==="
  "$RESOURCE_GUARD" run -- pnpm install --frozen-lockfile
else
  echo "=== pnpm install skipped (node_modules is current) ==="
fi

echo "=== guarded pnpm run lint ==="
"$RESOURCE_GUARD" run -- pnpm run lint

echo "=== guarded pnpm run build ==="
"$RESOURCE_GUARD" run -- pnpm run build

echo "=== Verification Complete ==="
echo ""
echo "Next steps:"
echo "1. Read _harness/tracking/feature_list.json to see current feature state"
echo "2. Pick ONE unfinished feature to work on"
echo "3. Implement only that feature"
echo "4. Re-run verification before claiming done"
