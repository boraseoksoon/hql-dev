#!/bin/bash
# Script to compile and install HQL as a standalone executable binary

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
HQL_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
SHARED_DIR="$(dirname "$HQL_ROOT")/shared"
BIN_DIR="$HQL_ROOT/bin"

# Debug paths
echo "Script directory: $SCRIPT_DIR"
echo "HQL root: $HQL_ROOT"
echo "Shared directory: $SHARED_DIR"
echo "Binary output directory: $BIN_DIR"
echo "Main.ts path: $HQL_ROOT/bin/main.ts"

# Create a temporary directory for compilation
TEMP_DIR=$(mktemp -d)
IMPORT_MAP_PATH="$TEMP_DIR/import_map.json"
BINARY_PATH="$BIN_DIR/hql"

# Create an import map to resolve shared dependencies
echo "Creating import map for dependencies..."
cat > "$IMPORT_MAP_PATH" << EOF
{
  "imports": {
    "shared/": "$SHARED_DIR/",
    "shared/logger-init.ts": "$SHARED_DIR/logger-init.ts",
    "shared/logger.ts": "$SHARED_DIR/logger.ts",
    "shared/common-error-utils.ts": "$SHARED_DIR/common-error-utils.ts"
  }
}
EOF

echo "Compiling HQL binary (skipping type checking)..."
# Determine the current platform and architecture
if [[ "$(uname -s)" == "Darwin" ]]; then
  if [[ "$(uname -m)" == "arm64" ]]; then
    TARGET="aarch64-apple-darwin"
  else
    TARGET="x86_64-apple-darwin"
  fi
else
  TARGET="" # Default to current platform
fi

# Compile using deno compile with --no-check to bypass TypeScript errors
if [[ -n "$TARGET" ]]; then
  deno compile --allow-all --no-check --import-map="$IMPORT_MAP_PATH" --output "$BINARY_PATH" --target "$TARGET" "$HQL_ROOT/bin/main.ts"
else
  deno compile --allow-all --no-check --import-map="$IMPORT_MAP_PATH" --output "$BINARY_PATH" "$HQL_ROOT/bin/main.ts"
fi

# Check if compilation was successful
if [[ ! -f "$BINARY_PATH" ]]; then
  echo "✗ Compilation failed"
  rm -rf "$TEMP_DIR"
  exit 1
fi

chmod +x "$BINARY_PATH"
echo "✓ Binary successfully compiled and installed at $BINARY_PATH"

# Clean up temporary directory
rm -rf "$TEMP_DIR"

echo ""
echo "You can now use HQL from the command line by running:"
echo "  $BINARY_PATH run hello.hql"
echo "  $BINARY_PATH transpile hello.hql output.js" 