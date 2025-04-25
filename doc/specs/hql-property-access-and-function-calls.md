# HQL Property Access and Function Call Disambiguation

## Overview

HQL provides a syntactic construct `(object arg)` that can be interpreted in two distinct ways:

1. As a property/array access: `object[arg]` in JavaScript
2. As a function call: `object(arg)` in JavaScript

This document explains how HQL resolves this ambiguity using a robust fallback mechanism.

## The Ambiguity Problem

Consider the following HQL examples:

```hql
;; Case 1: Array indexing
(var names ["Alice", "Bob", "Charlie"])
(names 0)  ;; Should access the first element: "Alice"

;; Case 2: Function call
(fn multiply (n) (* n 2))
(multiply 5)  ;; Should call the function: 10
```

The same `(object arg)` syntax is used for both cases, yet the intended behavior is different.

Even more complex are cases where a symbol could be both a function and an object with properties:

```hql
;; Function with properties
(fn get-data (id) (str "Data for ID: " id))
(set! get-data.version "1.0")

;; Ambiguous: access property or call function?
(get-data "version")  ;; Should access property: "1.0"
(get-data "123")      ;; Should call function: "Data for ID: 123"
```

## The Resolution Strategy

HQL uses a runtime fallback mechanism with type-specific handling:

### 1. String Keys: Property Access with Function Call Fallback

For expressions with string arguments `(obj "key")`:

1. First attempt property access: `obj["key"]`
2. If the property is undefined, attempt function call: `obj("key")`

Implementation:
- The transpiler generates a call to the `get` function
- The `get` function implements the fallback logic

### 2. Numeric Keys: Array Access with Function Call Fallback

For expressions with numeric arguments `(obj 0)`:

1. First attempt array indexing: `obj[0]`
2. If the indexed value is undefined, attempt function call: `obj(0)`

Implementation:
- The transpiler generates a call to the `getNumeric` function
- The `getNumeric` function implements the fallback logic

## Implementation Details

The implementation uses a clean, principled approach:

1. No hacks or heuristics based on naming conventions
2. No reliance on symbol length, underscores, or other patterns
3. No extensive static analysis required at transpile time

Instead, the transpiler emits code that resolves the ambiguity at runtime by trying the most likely interpretation first and falling back to the alternative if needed.

### For string key access (`get` function):

```javascript
// Simplified implementation of the runtime 'get' function
function get(obj, key) {
  const result = obj[key];
  return result !== undefined ? result : obj(key);
}
```

### For numeric key access (`getNumeric` function):

```javascript
// Simplified implementation of the runtime 'getNumeric' function
function getNumeric(obj, key) {
  try {
    const result = obj[key];
    return result !== undefined ? result : obj(key);
  } catch {
    return obj(key);
  }
}
```

## Examples in Context

### String Property Access vs Function Call

```hql
;; Define an object with properties
(var person {"name": "John", "age": 30})

;; Define a function with a property
(fn get-hobby (key) (str "Finding hobby: " key))
(set! get-hobby.version "1.0")

;; Access property
(person "name")  ;; "John" - property access

;; Access non-existent property
(person "address")  ;; undefined - property doesn't exist

;; Access property on function
(get-hobby "version")  ;; "1.0" - property access succeeds

;; Call function (property doesn't exist)
(get-hobby "reading")  ;; "Finding hobby: reading" - falls back to function call
```

### Numeric Array Indexing vs Function Call

```hql
;; Define an array
(var fruits ["apple", "banana", "cherry"])

;; Define a function with a numeric property
(fn multiply-by-two (n) (* n 2))
(set! multiply-by-two.0 "zero-property")

;; Access array element
(fruits 2)  ;; "cherry" - array indexing

;; Access out-of-bounds element
(fruits 10)  ;; undefined - index doesn't exist

;; Access numeric property on function
(multiply-by-two 0)  ;; "zero-property" - property access succeeds

;; Call function (property doesn't exist)
(multiply-by-two 5)  ;; 10 - falls back to function call
```

### Lambda and Method Chain Contexts

```hql
;; Lambda with array indexing
(var entries (Object.entries person))
(var filtered (entries.filter (lambda (entry) (not= (entry 0) "age"))))
;; (entry 0) uses array indexing to get the key from each [key, value] entry

;; Lambda with function call
(var numbers [1, 2, 3, 4, 5])
(var doubled (numbers.map (lambda (n) (multiply-by-two n))))
;; (multiply-by-two n) calls the function with each array element
```

## Best Practices

1. **Be explicit when possible**: Use dot notation (`object.property`) for static property access when the property name is known at write time.

2. **Use the getter functions directly**: When needed, explicitly use `(get obj "key")` or `(get obj 0)` to make your intent clear.

3. **Avoid mixing objects/arrays with functions that have the same name**: While the fallback mechanism handles this case, it's clearer to keep them distinct.

## Transpiler Implementation Notes

The HQL transpiler implements this behavior through several key components:

1. `createPropertyAccessWithFallback` for string key access
2. `createNumericAccessWithFallback` for numeric key access
3. Runtime helpers that execute the fallback logic in the generated JavaScript

This approach allows HQL to maintain its clean, lisp-like syntax while correctly handling the ambiguity between property/array access and function calls.
