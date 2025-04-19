# HQL Import System

The HQL language supports importing from multiple file types and source locations, enabling integration with various JavaScript/TypeScript ecosystems.

## Supported Import Types

HQL can import from the following sources:

| Type | Extension/Format | Processing |
|------|------------------|------------|
| HQL files | `.hql` | Transpiled to TypeScript then to JavaScript |
| JavaScript files | `.js`, `.mjs`, `.cjs` | Processed for nested HQL imports |
| TypeScript files | `.ts`, `.tsx` | Processed for nested HQL imports |
| NPM modules | `npm:package-name` | Imported from NPM registry via CDNs |
| JSR modules | `jsr:package-name` | Imported from JSR registry |
| HTTP(S) modules | `https://...` or `http://...` | Directly imported from URLs |
| Node.js built-ins | `node:module-name` | Treated as external, resolved at runtime |

## Import Syntax

HQL follows S-expression based syntax for imports:

### Simple Import (Full Module)

```
(import "module-path")
```

### Namespace Import

```
(import module-name from "module-path")
```

### Named Import (Vector Style)

```
(import [symbol1 symbol2] from "module-path")
```

### Named Import with Aliases

```
(import [symbol1 symbol2 as alias2] from "module-path")
```

## Importing Different File Types

### Importing HQL Files

```
(import [add subtract] from "./math.hql")
```

HQL files are fully processed by the transpiler:
1. The `.hql` file is parsed and transpiled to TypeScript
2. Any nested imports in the HQL file are processed
3. The resulting TypeScript is cached
4. Import statements are updated to reference the cached version

### Importing JavaScript Files

```
(import [fetchData] from "./api.js")
```

JavaScript imports are handled specially:
1. The system checks if the JS file contains HQL imports
2. If needed, those nested HQL imports are processed
3. The processed JS file is cached
4. Import statements are updated to reference the cached version

### Importing TypeScript Files

```
(import [User] from "./models.ts")
```

TypeScript files follow a similar process to JavaScript:
1. TypeScript files are analyzed for HQL imports
2. Nested HQL imports are processed
3. The modified TypeScript is cached
4. Import statements are updated accordingly

### Importing Remote Modules

NPM modules:
```
(import axios from "npm:axios")
```

JSR modules:
```
(import collection from "jsr:@std/collections")
```

HTTP modules:
```
(import utils from "https://esm.sh/lodash")
```

Remote modules are processed differently:
1. The system attempts multiple CDN sources for NPM modules
2. JSR modules are loaded directly from the JSR registry
3. HTTP(S) modules are loaded directly from their URLs
4. All are processed as external modules with no transpilation

## Import Resolution Process

When resolving imports, the system follows this sequence:

1. If the import has a recognized external pattern (`.js`, `npm:`, etc.), it's marked as external
2. The system checks if the path is already in the import mapping cache
3. If not found, it tries multiple resolution strategies:
   - Relative to the importing file
   - Relative to the source directory
   - Relative to the current working directory
   - Relative to the lib directory
4. If found, the path mapping is cached for future lookups
5. If not found, the import is marked as external

## Hyphenated Identifiers

HQL provides special handling for identifiers with hyphens:

```
(import [my-func] from "./util.hql")
```

Since JavaScript doesn't support hyphens in identifiers, they are automatically:
- Converted to snake_case (`my_func`) by default 
- Or optionally to camelCase (`myFunc`)

## Path Preservation

The import system maintains relative path structures between files, ensuring that:
- Imports between files maintain their relationships
- Source maps work correctly for debugging
- The final bundled output correctly references all dependencies

## Advanced Features

### Circular Import Handling

The system detects and safely handles circular imports by:
- Tracking in-progress file processing
- Resolving circular dependencies through JavaScript module semantics

### Caching

The import system employs content-based caching to avoid redundant processing:
- Each file's content is hashed using SHA-256
- Cached versions are stored in the `.hql_cache` directory
- Import paths are mapped between original and cached versions
- Only changed files are reprocessed 