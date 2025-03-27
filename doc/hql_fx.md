Below is the updated documentation incorporating named default values:

---

# HQL fx Function

## Overview

The `fx` construct is used exclusively for defining **pure functions**. These
functions are statically guaranteed to be free of side effects and do not
capture any external state. They must rely solely on their parameters and local
immutable bindings (typically created with `let`). This purity enables easier
reasoning, testing, and optimizations such as memoization or parallel execution.

## Syntax

There are two allowed syntaxes for specifying the type signature of an `fx`
function. Both are considered equivalent in terms of semantics; you can choose
the form that best suits your stylistic preferences.

### Option 1: Inline Parameter List

In this form, the parameter list is a simple whitespace‑separated sequence where
each parameter is annotated with its type using the colon syntax. The return
type is specified after the arrow (`->`).

```lisp
(fx add (x: Int y: Int) -> Int
  (+ x y))
```

### Option 2: Wrapped Signature Form

In this alternative form, the entire type signature (parameter list along with
the return type) is wrapped inside an extra set of parentheses.

```lisp
(fx add ((x: Int y: Int) -> Int)
  (+ x y))
```

Both forms are allowed, and the choice is purely stylistic.

### Named Default Values

Parameters in an `fx` function can include default values by using the equals
sign (`=`) after the type annotation. When a default value is provided, callers
may omit that parameter, and the default will be used. However, parameters
without defaults must always be specified.

For example, consider a function where only `x` has a default value:

```lisp
(fx add ((x: Int = 100 y: Int) -> Int)
  (+ x y))

(add y: 20)       ;; returns 120 because x defaults to 100
(add x: 10 y: 20) ;; returns 30
(add)            ;; error: y is required
```

And a function where both parameters have defaults:

```lisp
(fx add ((x: Int = 100 y: Int = 200) -> Int)
  (+ x y))

(add)            ;; 300
(add x: 99)      ;; 299
(add y: 99)      ;; 199
(add x: 1 y: 2)  ;; 3
(add 1 2)        ;; 3
```

```lisp
(fx add (x y)
  (+ x y))

(add)            ;; not allowed. non-typed fx must specify all parameters
(add x: 99)      ;; not allowed. non-typed fx must specify all parameters
(add x: 1 y: 2)  ;; 3
(add 1 2)        ;; 3
```

## Function Body

After the type signature, the function body follows. Since `fx` functions are
pure:

- **Only local bindings and parameters may be referenced.**
- **Side effects** (e.g., I/O, mutable state changes) **are disallowed.**

Any violation of these constraints should result in a compile‑time error,
ensuring that the function remains predictable and free from hidden
dependencies.

## Calling `fx` Functions

Pure functions defined with `fx` are invoked using named parameters. Regardless
of whether you use explicit type annotations or not, the function is called in a
similar fashion.

### With Explicit Type Annotations

When the function is defined with type hints, your development environment may
provide better intellisense and compile‑time checks:

```lisp
(fx add (x: Int y: Int) -> Int
  (+ x y))

;; Function call:
(add x: 10 y: 20)
```

### Without Explicit Type Annotations

If type annotations are omitted (default behavior), the calling syntax remains
the same. Note that intellisense support may be limited:

```lisp
(fx add (x y)
  (+ x y))

;; Function call: fx function when called must specify all parameters since there is no type and named argument having default values.
(add 10 20)
```

## Key Characteristics

- **Purity Guarantee:**\
  All `fx` functions must be self‑contained. They do not capture any external
  variables or perform side effects.

- **Mandatory Type Annotations:**\
  The function signature includes explicit type annotations for both parameters
  and the return type, serving as a clear contract between the function and its
  callers.

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
