#!/bin/bash
# Build script for HQL expression evaluator binary

echo "Building HQL expression evaluator binary..."

# Set binary output directory
BIN_DIR="$(dirname "$0")"
cd "$BIN_DIR"

# Compile simple-eval.ts into the HQL binary
deno compile --allow-all --output "hql-expr" hql-expr.ts

# Make the binary executable
chmod +x hql-expr

echo "HQL expression evaluator binary built successfully!"
echo "Try it with: ./hql-expr \"(+ 1 1)\"" 