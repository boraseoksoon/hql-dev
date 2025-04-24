# HQL Macro System

## Overview

HQL implements a rich macro system inspired by Lisp traditions but adapted for a JavaScript transpilation target. The system distinguishes between two types of macros:

1. **System-level macros** - Global macros for core language features
2. **User-level macros** - Module-scoped macros for user code organization

This document outlines the design, usage patterns, and implementation details of both macro types.

## System-Level Macros: `defmacro`

System-level macros are globally available throughout the codebase without requiring explicit imports.

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
- Primarily used by language implementers for core features
- Live in the global macro namespace

### Example

```lisp
(defmacro unless [test & body]
  `(if ~test
       nil
       (do ~@body)))
```

## User-Level Macros: `macro`

User-level macros are module-scoped and follow the same import/export rules as regular functions.

### Definition

```lisp
(macro macro-name [parameters]
  body-expression)
```

### Characteristics

- Defined using the `macro` special form
- Scoped to the module where they are defined
- Must be explicitly exported to be used outside their module
- Must be explicitly imported to be used in another module
- Respect module boundaries to prevent namespace pollution
- Support both direct and namespace imports

### Example

```lisp
;; In utils.hql
(macro format-message [msg]
  `(str "MESSAGE: " ~msg))

;; Export the macro like any other function
(export [format-message])
```

### Usage

User-level macros can be imported in two ways:

#### Direct named import:

```lisp
;; Import specific macro directly
(import [format-message] from "./utils.hql")

;; Use directly
(format-message "Hello, world!")  ;; => "MESSAGE: Hello, world!"
```

#### Namespace import:

```lisp
;; Import entire module as namespace
(import utils from "./utils.hql")

;; Access macro through namespace
(utils.format-message "Hello, world!")  ;; => "MESSAGE: Hello, world!"
```

## Implementation Details

### Macro Registry

The macro system maintains two separate registries:

1. **System Macro Registry** - For `defmacro` global macros
2. **Module Macro Registry** - Maps file paths to their local macros

### Expansion Process

1. During the code expansion phase, macros are detected and applied
2. For each module, the system checks:
   - Global macros from the system registry
   - Local macros defined in the current module
   - Imported macros from other modules

### Scope Resolution Order

When resolving a macro name, the system checks in the following order:

1. Is it a built-in system macro (from `defmacro`)? 
2. Is it a local macro defined in the current module?
3. Is it an imported macro from another module?

## Import/Export Behavior

User-level macros follow the same import/export rules as other module elements:

### Exporting Macros

```lisp
;; Vector style export (recommended)
(export [my-macro, another-macro])

;; Individual export
(export [my-macro]) 
```

### Importing Macros

```lisp
;; Named imports
(import [my-macro, another-macro] from "./macros.hql")

;; With aliases
(import [my-macro as renamed-macro] from "./macros.hql")

;; Namespace import
(import macros from "./macros.hql")
(macros.my-macro arg1 arg2)  ;; Access through namespace
```

## Best Practices

1. Use `defmacro` only for essential, foundational language constructs
2. Use `macro` for all user-defined macros in application code
3. Prefer vector-style exports for consistency: `(export [macro1, macro2])`
4. Always use explicit imports with `from`: `(import [macro1] from "./module.hql")`
5. Consider using aliases to avoid name conflicts
6. Document macro behavior, especially when extending the language semantics

## Debugging Macros

When debugging macro issues, consider:

1. Checking if the macro is properly exported from its source module
2. Verifying the correct import syntax is used in the consumer module
3. Examining the transpiled JavaScript to understand how the macro expanded
4. Using explicit aliases if there might be name conflicts

## Common Issues

1. **Macro Not Found** - Check if the macro is exported, properly named, and without typos
2. **Expansion Problems** - Verify the macro implementation, ensuring proper quasiquoting
3. **Namespace Issues** - Confirm the namespace access pattern matches the import style
4. **Circular Dependencies** - Avoid circular references between modules that define and use macros