#!/bin/bash

# Fix path imports
find . -name "*.ts" -type f -exec sed -i '' 's|"https://deno.land/std@[^/]*/path/mod.ts"|"jsr:@std/path@1"|g' {} \;

# Fix TypeScript import
find . -name "*.ts" -type f -exec sed -i '' 's|"npm:typescript"|"npm:typescript@^5.0.0"|g' {} \;

# Fix esbuild import
find . -name "*.ts" -type f -exec sed -i '' 's|"https://deno.land/x/esbuild@[^"]*"|"npm:esbuild@^0.17.0"|g' {} \;

echo "Imports fixed"