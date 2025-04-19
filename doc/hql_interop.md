# HQL Interoperability Guide

This document provides a comprehensive overview of HQL's interoperability with TypeScript, JavaScript, and remote modules. HQL is designed to work seamlessly with the JavaScript ecosystem, allowing for barrier-free imports between different file types and module systems.

## Core Interoperability Features

HQL provides bidirectional interoperability with:
- JavaScript (both ESM and CommonJS)
- TypeScript
- Remote modules (npm, JSR, HTTP/HTTPS)

This means you can:
1. Import JavaScript/TypeScript into HQL
2. Import HQL into JavaScript/TypeScript
3. Mix and match imports across file types
4. Handle circular dependencies between any combination of languages

## Supported Import Scenarios

The following table shows all supported import scenarios in the HQL ecosystem:

| Source | Target | Status | Notes |
|--------|--------|--------|-------|
| **HQL as Importer** | | | |
| HQL → HQL | ✅ Supported | Fully supported with proper resolution and caching |
| HQL → JavaScript | ✅ Supported | Supports importing JS functions, objects, and classes |
| HQL → TypeScript | ✅ Supported | Imports TS with automatic type stripping |
| HQL → npm/JSR modules | ✅ Supported | Uses `npm:` or `jsr:` prefix |
| HQL → HTTP/HTTPS modules | ✅ Supported | Supports URL imports |
| **JavaScript as Importer** | | | |
| JavaScript → HQL | ✅ Supported | HQL transpiled to JS automatically |
| JavaScript → JavaScript | ✅ Supported | Native JS behavior, preserved in bundle |
| JavaScript → TypeScript | ✅ Supported | TS automatically transpiled to JS |
| JavaScript → Remote modules | ✅ Supported | Standard JS module resolution |
| **TypeScript as Importer** | | | |
| TypeScript → HQL | ✅ Supported | HQL transpiled to TS automatically |
| TypeScript → JavaScript | ✅ Supported | Standard TS module resolution |
| TypeScript → TypeScript | ✅ Supported | Standard TS module resolution |
| TypeScript → Remote modules | ✅ Supported | Standard TS module resolution |
| **Circular Dependencies** | | | |
| HQL → HQL → HQL | ✅ Supported | Circular dependencies detected and handled |
| HQL → JavaScript → HQL | ✅ Supported | Circular dependencies properly resolved |
| HQL → TypeScript → HQL | ✅ Supported | Circular dependencies properly resolved |
| JavaScript → HQL → JavaScript | ✅ Supported | Properly handled and bundled |
| TypeScript → HQL → TypeScript | ✅ Supported | Properly handled and bundled |

## Example Code

### HQL Importing JavaScript

```hql
;; HQL importing from JavaScript
(import [jsFunction formatDate] from "./utils.js")

(fn processData (input)
  (var formatted (formatDate input))
  (jsFunction formatted))

(export [processData])
```

### HQL Importing TypeScript

```hql
;; HQL importing from TypeScript
(import [Calculator formatResult] from "./calculator.ts")

(fn calculate (a b)
  (var calc (new Calculator))
  (var result (calc.add a b))
  (formatResult result))

(export [calculate])
```

### JavaScript Importing HQL

```javascript
// JavaScript importing from HQL
import { calculateSum, processArray } from './math.hql';

// Use the imported functions
const sum = calculateSum(10, 20);
const processed = processArray([1, 2, 3, 4, 5]);

console.log(`Sum: ${sum}, Processed: ${processed}`);
```

### TypeScript Importing HQL

```typescript
// TypeScript importing from HQL
import { calculateSum, DataProcessor } from './data.hql';

// With type annotations
function analyze(data: number[]): number {
  const processor = new DataProcessor();
  return processor.process(data) + calculateSum(5, 10);
}

export { analyze };
```

### Circular Dependency Example

```hql
;; file: math.hql
(import [processResult] from "./processor.js")

(fn calculate (a b)
  (var sum (+ a b))
  (processResult sum))

(export [calculate])
```

```javascript
// file: processor.js
import { calculate } from './math.hql';

export function processResult(value) {
  console.log(`Processing: ${value}`);
  return value * 2;
}

export function doubleCalculate(a, b) {
  return calculate(a, b) * 2;
}
```

## How It Works

The HQL bundler system implements full interoperability through:

1. **Unified Resolution Strategy**: A single coherent pipeline that resolves all import types
2. **Automatic Transpilation**: HQL is transpiled to JS or TS based on the importing language
3. **Circular Dependency Detection**: Smart handling of circular references
4. **Caching System**: Efficient reuse of transpiled code to minimize redundant work

## Best Practices

1. **Use explicit file extensions** in import paths for clarity
2. **Avoid complex circular dependencies** when possible, though they are supported
3. **Be mindful of type information** when importing TypeScript into HQL (types are stripped)
4. **Use relative imports** where appropriate for clearer dependency chains
5. **Test interoperability** specifically with your module structure

## Edge Cases and Solutions

### Hyphenated Identifiers

Identifiers with hyphens are automatically sanitized across language boundaries:

```hql
;; HQL with hyphenated identifier
(fn calculate-sum (a b)
  (+ a b))

(export [calculate-sum])
```

When imported into JavaScript:

```javascript
import { calculate_sum } from './math.hql';
// The hyphen is replaced with underscore
```

### TypeScript Type Definitions

When importing HQL into TypeScript, you may need type definitions for complex structures:

```typescript
// Declare types for HQL imports
interface HQLProcessor {
  process(data: number[]): number;
  filter(predicate: (item: number) => boolean): HQLProcessor;
}

// Import from HQL
import { createProcessor } from './processor.hql';

// Use with type assertion
const processor = createProcessor() as HQLProcessor;
```

## Conclusion

HQL's interoperability system provides a seamless experience when working across language boundaries. By supporting bidirectional imports between HQL, JavaScript, TypeScript, and remote modules, developers can build complex applications that leverage the strengths of each language while maintaining a cohesive codebase. 