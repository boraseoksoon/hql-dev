# Logger Migration Plan

## Overview

This document outlines the plan to migrate all Logger instances in the codebase to use the singleton pattern via the `getLogger` function from `logger-init.ts`. This will ensure consistent logging behavior across the application and reduce redundancy.

## Steps

### 1. Fix Manual Updates

- Update `src/environment.ts` to use the logger singleton
- Update any files in `src/repl/` directory that still use direct instantiation
- Update any files in `src/transpiler/` directory that still use direct instantiation
- Fix `src/utils/temp-file-tracker.ts` which has multiple logger instances

### 2. Handling of `Deno.env.get("HQL_DEBUG")`

Many files use `Deno.env.get("HQL_DEBUG") === "1"` to determine if verbose logging is enabled. We should standardize this pattern by:

1. Adding a utility function in `logger-init.ts` to check for debug mode
2. Using this function consistently

```typescript
// In logger-init.ts
export function isDebugMode(): boolean {
  return Deno.env.get("HQL_DEBUG") === "1";
}

// Usage
const logger = getLogger({ verbose: isDebugMode() });
```

### 3. Path to Fixing All Files

Files to update, grouped by directory:

#### src/repl/
- history-manager.ts
- module-aware-evaluator.ts

#### src/transpiler/
- syntax/data-structure.ts
- syntax/import-export.ts
- syntax/class.ts
- syntax/enum.ts
- syntax/function.ts
- error/error-initializer.ts
- error/error-handling.ts
- fx/purity.ts
- pipeline/hql-ir-to-ts-ast.ts
- pipeline/ts-ast-to-ts-code.ts
- pipeline/hql-ast-to-hql-ir.ts

#### src/utils/
- temp-file-tracker.ts

#### src/
- environment.ts

### 4. Script Updates

Improve the `update-logger-usage.ts` script to:
- Handle more complex cases
- Fix correct import paths (use relative paths correctly)
- Support the HQL_DEBUG pattern

## Testing After Migration

After updating all files:

1. Verify that logging still works correctly with:
   - `--verbose` flag
   - `--log <namespace>` flag
   - No flags

2. Make sure debug mode works when `HQL_DEBUG=1` is set

3. Verify that error reporting still functions properly

## Benefits

- Reduced code redundancy
- Consistent logging patterns
- Easier to maintain and update
- Better control over log levels and namespaces 