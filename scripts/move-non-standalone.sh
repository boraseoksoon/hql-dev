#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$ROOT_DIR/doc/demos/import-export" || true
mkdir -p "$ROOT_DIR/doc/demos/import-test" || true

# Move demo/negative examples out of the main examples tree
mv -f "$ROOT_DIR/doc/examples/import-export" "$ROOT_DIR/doc/demos/" 2>/dev/null || true
mv -f "$ROOT_DIR/doc/examples/import-test/complex-imports.hql" "$ROOT_DIR/doc/demos/import-test/" 2>/dev/null || true

echo "Moved non-standalone demos to doc/demos/."

