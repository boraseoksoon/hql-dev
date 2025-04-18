# HQL - Modern TypeScript Transpiler

## Caching System

HQL uses a modern caching system to optimize the transpilation process:

### How It Works

- All intermediary files (TS and JS) are stored in a `.hql-cache` directory
- Content-based hashing ensures files are only regenerated when they change
- Follows the pattern of modern bundlers like webpack, esbuild, and others

### Cache Directory Structure

```
.hql-cache/
  ├── 1/                     # Cache version
  │   ├── src/               # Mirrors source directory structure
  │   │   ├── module1/
  │   │   │   ├── abc123de/  # Content hash directories
  │   │   │   │   ├── file.ts
  │   │   │   │   └── file.js
  │   │   ├── module2/
  │   │   └── ...
  │   └── temp/              # Temporary directories
  │       ├── entry-asdf123/
  │       └── expr-5678xyz/
```

### Benefits

- Keeps your source directory clean (no transpiled files next to source)
- Faster compilation through intelligent caching
- Files are only regenerated when content changes
- All managed by the system, no manual intervention needed

### CLI Options

- `--force`: Force regeneration of all files, ignoring cache
- `--cache-info`: Show information about the cache
- Run `deno run -A cli/clean-cache.ts` to clean the cache directory

---

## Development

### Building and Running

```bash
# Transpile an HQL file to JS
deno run -A cli/transpile.ts path/to/file.hql [output.js]

# Execute an HQL file directly
deno run -A cli/run.ts path/to/file.hql

# Clean the cache
deno run -A cli/clean-cache.ts
```

### Options

```
--verbose, -v     Enable verbose logging
--time            Show performance timing
--force           Force regeneration, ignoring cache
--cache-info      Show cache statistics
``` 