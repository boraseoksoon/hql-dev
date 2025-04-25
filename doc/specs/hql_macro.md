# HQL Macro System

## Overview

HQL implements a rich macro system inspired by Lisp traditions but adapted for a JavaScript transpilation target. The macro system provides a powerful way to extend the language and create abstraction layers.

This document outlines the design, usage patterns, and implementation details of the HQL macro system.

## Macros: `defmacro`

Macros are globally available throughout the codebase without requiring explicit imports.

### Definition

```lisp
(defmacro macro-name [parameters]
  body-expression)
```

### Characteristics

- Defined using the `defmacro` special form
- Registered globally in the system
- Available in all modules without importing
- Cannot be meaningfully exported (since they're already global)
- Used for both language features and user-defined abstractions
- Live in the global macro namespace

### Example

```lisp
(defmacro unless [test & body]
  `(if ~test
       nil
       (do ~@body)))
```



## Implementation Details

### Macro Registry

The macro system maintains a global registry for all macros defined with `defmacro`.

### Expansion Process

1. During the code expansion phase, macros are detected and applied
2. For each module, the system checks for matching macros in the global registry

### Scope Resolution

Macros are resolved from the global macro registry, making them accessible throughout the codebase without explicit imports.

## Macro Visibility

Macros defined with `defmacro` are globally available and do not require import or export operations. They are accessible in all modules automatically after they are defined.

## Best Practices

1. Use `defmacro` for both language features and user-defined abstractions
2. Consider macro naming carefully to avoid conflicts in the global namespace
3. Document macro behavior, especially when extending the language semantics
4. Keep macros focused on specific transformations for better maintenance

## Debugging Macros

When debugging macro issues, consider:

1. Confirming the macro is defined with the correct name and parameters
2. Examining the transpiled JavaScript to understand how the macro expanded
3. Checking for naming conflicts in the global namespace

## Common Issues

1. **Macro Not Found** - Check if the macro is properly named and without typos
2. **Expansion Problems** - Verify the macro implementation, ensuring proper quasiquoting
3. **Name Conflicts** - Be aware that all macros share the same global namespace
4. **Circular Dependencies** - Avoid circular references between macros