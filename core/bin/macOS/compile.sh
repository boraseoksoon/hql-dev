#!/bin/bash
# Script to compile HQL into a single binary executable

# Set the directory of this script as the current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

# Output directory for the binary
OUTPUT_DIR="./bin"
mkdir -p "$OUTPUT_DIR"

echo "Compiling HQL binary..."

# Detect the current platform
PLATFORM="$(uname -s)"
ARCHITECTURE="$(uname -m)"

# Set target based on the current platform
if [[ "$PLATFORM" == "Darwin" ]]; then
  if [[ "$ARCHITECTURE" == "arm64" ]]; then
    TARGET="aarch64-apple-darwin"
  else
    TARGET="x86_64-apple-darwin"
  fi
elif [[ "$PLATFORM" == "Linux" ]]; then
  TARGET="x86_64-unknown-linux-gnu"
else
  # Default to current platform if not specifically handled
  TARGET=""
fi

# Use deno compile to create a standalone executable
if [[ -n "$TARGET" ]]; then
  echo "Building for target: $TARGET"
  deno compile --allow-all \
    --output "$OUTPUT_DIR/hql" \
    --target "$TARGET" \
    cli/main.ts
else
  # No specific target (compile for current platform)
  echo "Building for current platform"
  deno compile --allow-all \
    --output "$OUTPUT_DIR/hql" \
    cli/main.ts
fi

# Check if compilation was successful
if [ $? -eq 0 ]; then
  echo "Compilation successful!"
  echo "Binary file has been created: $OUTPUT_DIR/hql"
  echo "You can now add this directory to your PATH or move the binary to a directory in your PATH"
else
  echo "Compilation failed!"
  exit 1
fi 