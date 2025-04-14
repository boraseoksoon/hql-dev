#!/bin/bash
# Build script for HQL binary

# Set the script to exit on any error
set -e

# Ensure we're in the correct directory
cd "$(dirname "$0")"

echo "Building HQL binary..."

# Compile main.ts into the HQL binary
deno compile --allow-all --output ./hql main.ts

# Make the binary executable
chmod +x hql

echo "HQL binary built successfully!"
echo "Run ./install.sh to finalize installation" 