# HQL Gotchas and Common Issues

## Summary of Test Results
- **Local HQL**: 88/111 examples pass (79%)
- **JSR 7.8.7**: 87/111 examples pass (78%)
- **Core curated tests**: 30/30 pass (100%) both local and JSR

## Key Issues Found

### 1. Map/Object Syntax
❌ **Wrong**: `{:key value}` or `{"key" value}`
✅ **Correct**: `{"key": value}` (JSON syntax with colons)

```hql
;; Wrong
(var person {:name "John"})

;; Correct  
(var person {"name": "John"})
```

### 2. Property Access
❌ **Wrong**: `.-property` 
✅ **Correct**: `.property` (no hyphen)

```hql
;; Wrong
(print (.-name obj))

;; Correct
(print obj.name)
```

### 3. Vector/Array Export Syntax
❌ **Wrong**: `[item1, item2, item3]` (commas in vectors)
✅ **Correct**: `[item1 item2 item3]` (space-separated)

```hql
;; Wrong
(export [func1, func2, func3])

;; Correct
(export [func1 func2 func3])
```

### 4. If as Expression in Loop Context
**Issue**: `if` cannot be used as expression inside `do` blocks within loops in certain contexts.

```hql
;; This fails
(loop (i 0)
  (if (< i 10)
    (do
      (var status (if condition "yes" "no"))  ;; Error!
      (recur (+ i 1)))
    nil))

;; Workaround: Use a function
(fn get-status [condition]
  (if condition "yes" "no"))

(loop (i 0)
  (if (< i 10)
    (do
      (var status (get-status condition))  ;; Works!
      (recur (+ i 1)))
    nil))
```

### 5. Function Parameter Vector Notation
**Fixed in 7.8.2+**: Vector notation `[x y]` for function parameters now works correctly.

### 6. Let Bindings
**Fixed in 7.8.2+**: Let bindings with vector notation now work correctly.

### 7. Array Element Updates
`set!` takes exactly 2 arguments: target (with property) and value.

```hql
;; Wrong - trying to set array element
(set! arr 0 value)

;; Correct - use splice or property
(.splice arr 0 1 newValue)
;; or
(set! obj.property value)
```

## Failed Example Categories

### Intentionally Broken/Test Fixtures (25 files)
- `import-export/` - Testing wrong function arity
- `test-complex-imports/` subdirectories - Complex multi-file test scenarios
- `import-test/` utility files - Support files for other tests
- `circular-dependency/` - Testing circular import handling

### Real Issues to Fix
1. **Comma syntax in exports** - Fixed in utility.hql
2. **Wrong function arity** - Fixed in import-export examples  
3. **If-as-expression in loops** - Known limitation, needs workaround

## Recommendations

1. **Clean up examples directory**:
   - Move test fixtures to a separate `test-fixtures/` directory
   - Keep only runnable examples in `examples/`

2. **Fix HQL bugs**:
   - If-as-expression in loop/do contexts
   - Better error messages for syntax issues

3. **Documentation**:
   - Add this gotchas doc to main README
   - Update spec to clarify syntax rules

## Working User Example

```hql
;; todo.hql - A working TODO app in HQL
(fn create-todo [title]
  {"id": (.now Date)
   "title": title
   "completed": false})

(fn status-str [completed]
  (if completed "✓" " "))

(var todos [])
(.push todos (create-todo "Learn HQL"))
(.push todos (create-todo "Build an app"))

(print "TODO List:")
(loop (i 0)
  (if (< i todos.length)
    (do
      (var todo (get todos i))
      (print (str "  [" (status-str todo.completed) "] " todo.title))
      (recur (+ i 1)))
    nil))
```

This example works both locally and via JSR 7.8.7.