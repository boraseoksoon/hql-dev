# Error Handling Architecture

This directory contains the error handling infrastructure for the HQL transpiler. The design follows a consolidation approach where all error utilities are centralized into a single source of truth.

## Core Principles

1. **Single Source of Truth**: All error utilities are defined in `common-error-utils.ts`
2. **Consistent Error Types**: All error types are defined in `errors.ts`
3. **Enhanced Reporting**: Errors include context, source location, and helpful suggestions
4. **Standardized Patterns**: Common patterns like `perform`, `performAsync`, and `wrapError` for consistent handling

## Key Files

- **common-error-utils.ts**: THE central module for all error utilities
- **errors.ts**: Defines all error types and classes
- **error-reporter.ts**: Provides error reporting functionality
- **error-initializer.ts**: Sets up global error handling

## Deprecated Files

- **error-utils.ts**: DEPRECATED - use `common-error-utils.ts` instead
- **error-handling.ts**: Partially consolidated into `common-error-utils.ts`

## Standard Usage Patterns

### 1. Wrapping Synchronous Operations

```typescript
import { perform } from "../error/common-error-utils.ts";

// Use perform to handle errors consistently
const result = perform(
  () => someRiskyOperation(),
  "Context for error",
  SpecificErrorType,
  [optionalErrorArgs]
);
```

### 2. Wrapping Asynchronous Operations

```typescript
import { performAsync } from "../error/common-error-utils.ts";

// Use performAsync for async operations
const result = await performAsync(
  async () => await someAsyncOperation(),
  "Context for error",
  SpecificErrorType,
  [optionalErrorArgs]
);
```

### 3. Higher-Order Error Handling

```typescript
import { withErrorHandling } from "../error/common-error-utils.ts";

// Create a wrapped function with error handling
const safeFunction = withErrorHandling(
  originalFunction,
  {
    source: sourceCode,
    filePath: "path/to/file.ts",
    context: "descriptive context",
    rethrow: true,
    logErrors: true
  }
);
```

## Migration Strategy

We've consolidated all error utilities into `common-error-utils.ts`. The migration included:

1. Updating all imports to use the consolidated module
2. Removing duplicate implementations 
3. Standardizing error handling patterns
4. Cleaning up backup files and test scripts

## Adding New Error Types

1. Define the new error class in `errors.ts`
2. Export it properly
3. Use standard utilities from `common-error-utils.ts` with the new error type 