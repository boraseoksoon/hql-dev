Okay, I understand. I will take the original documentation you provided and replace *only* the sections related to syntax definition and examples (`## Syntax`, `### Named Default Values`, `## Calling fx Functions`) with the refined versions from our discussion, leaving all other sections (Overview, Function Body, Key Characteristics, TODOs, Implementation, Summary, etc.) exactly as they were.

---

# HQL fx Function

## Overview

The `fx` construct is used exclusively for defining **pure functions**. These
functions are statically guaranteed to be free of side effects and do not
capture any external state. They must rely solely on their parameters and local
immutable bindings (typically created with `let`). This purity enables easier
reasoning, testing, and optimizations such as memoization or parallel execution.

## Syntax

The definition of an `fx` function starts with the `fx` keyword, followed by the function name, its signature (parameters and return type), and finally the function body.

```lisp
(fx function-name signature
  body...)
```

### Signature Forms

There are two allowed syntaxes for specifying the function's signature. Both are semantically equivalent.

**Form 1: Inline Parameter List**

The parameter list is defined directly after the function name, followed by an arrow (`->`) and the return type. Parameters are specified as `name: Type`.

```lisp
(fx add (x: Int y: Int) -> Int
  (+ x y))
```

**Form 2: Wrapped Signature**

The entire signature, including the parameter list and the `-> returnType` part, is enclosed in an extra set of parentheses.

```lisp
(fx add ((x: Int y: Int) -> Int)
  (+ x y))
```

### Parameters and Default Values

Parameters are defined within the signature using the `name: Type` notation.

You can provide default values using the equals sign (`=`) after the type annotation: `name: Type = defaultValue`.

* Parameters without default values are mandatory and must be provided when calling the function.
* Parameters with default values are optional; if omitted in a call, the default value is used.

**Example with one default:**

```lisp
(fx add ((x: Int = 100 y: Int) -> Int)
  (+ x y))

; Usage:
; (add y: 20)       evaluates to 120 (x defaults to 100)
; (add x: 10 y: 20) evaluates to 30
; (add)            causes an error because y is required
```

**Example with all defaults:**

```lisp
(fx add ((x: Int = 100 y: Int = 200) -> Int)
  (+ x y))

; Usage:
; (add)            evaluates to 300
; (add x: 99)      evaluates to 299
; (add y: 99)      evaluates to 199
; (add x: 1 y: 2)  evaluates to 3
; (add 1 2)        evaluates to 3
```

### Untyped Functions

You can also define `fx` functions without explicit type annotations. In this case, the signature only contains the parameter names. Default values are not supported for untyped parameters.

```lisp
(fx add (x y)
  (+ x y))
```

All parameters for untyped `fx` functions are mandatory.

### Calling `fx` Functions

Functions defined with `fx` are called using the function name followed by arguments.

**Typed Functions (with or without defaults):**

Calls can typically use named arguments (`name: value`). If all arguments are provided, positional arguments may also be allowed (based on examples).

```lisp
; Definition
(fx add ((x: Int = 100 y: Int = 200) -> Int)
  (+ x y))

; Calls
(add x: 10 y: 20)  ; Named arguments
(add y: 50)        ; Named argument, x uses default
(add 1 2)          ; Positional arguments (example suggests this works when all defaults exist)
```

**Untyped Functions:**

All parameters must be provided. Examples suggest both named and positional calls are possible if all arguments are specified.

```lisp
; Definition
(fx add (x y)
  (+ x y))

; Calls
(add x: 1 y: 2)    ; Named arguments
(add 10 20)        ; Positional arguments

; Invalid calls for the untyped example:
; (add)            error: x and y required
; (add x: 99)      error: y required
```

## Function Body

After the type signature, the function body follows. Since `fx` functions are
pure:

- **Only local bindings and parameters may be referenced.**
- **Side effects** (e.g., I/O, mutable state changes) **are disallowed.**

Any violation of these constraints should result in a compile‑time error,
ensuring that the function remains predictable and free from hidden
dependencies.

## Key Characteristics

- **Purity Guarantee:**\
  All `fx` functions must be self‑contained. They do not capture any external
  variables or perform side effects.

- **Flexible Signature Syntax:**\
  Developers can choose between the inline parameter list or the wrapped
  signature form without any loss of expressiveness or clarity.

- **Named Default Values:**\
  Parameters can include default values, allowing for more flexible function
  calls. If a parameter with a default is omitted during the call, its default
  value is used. However, omitting a parameter without a default will result in
  a compile‑time error.

## TODO: Generic API

In future iterations, we plan to extend the `fx` syntax to support a generic
API. This will allow for polymorphic functions where type parameters can be
defined and constrained. An example of a generic function might look like:

```lisp
; TODO: Generic API
(fx identity <T> (x: T) -> T
  x)
```

This feature is not yet implemented but is on the roadmap to further enhance the
expressiveness and reusability of our pure function definitions.

## TODO: Pure function guranteee

HQL is in very early MVP and Proof of concept phase now without proper type
system.

## TODO: Define Pure function

Most of all, Pure function should be strictly defined in HQL term.

## HQL's fx Implementation: Current State & Evolution Path

### Current MVP Implementation

- **Static Analysis for Purity Verification**\
  Validates function only references parameters and local variables\
  Catches attempts to access external state\
  Prevents use of impure operations like print

- **Deep Copy Parameter Protection**\
  Uses JSON.parse/JSON.stringify for deep copying\
  Creates truly independent copies of all object/array parameters\
  Prevents side effects on original data

- **Core Pure Function Model**\
  Distinct syntax (fx vs fn) for pure and impure functions\
  Explicit purity guarantees in the language syntax\
  Allows parameter mutation but contains it via copying

- **JavaScript Interoperability**\
  Maintains full access to JavaScript ecosystem\
  Can intermix pure and impure code as needed\
  JS interop operations supported inside pure functions

## Summary

The `fx` function model is designed to provide a robust foundation for pure
functions by enforcing strict type annotations and disallowing side effects. The
two allowed syntaxes for type signatures offer flexibility while maintaining a
clear and minimal Lisp-like style. With the addition of named default values,
developers can now provide default arguments for parameters, enhancing
flexibility in function calls. With future plans to introduce generics, `fx` is
positioned to become a powerful tool for building reliable, maintainable, and
high-performance code.

---