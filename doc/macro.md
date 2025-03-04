# Understanding HQL: Syntactic Sugar and Macro Expansion

HQL (Haskell Query Language) is designed as a modern Lisp that runs natively on JavaScript runtimes. One of its key features is rich syntactic sugar that makes code more expressive and natural to write, while maintaining the power of Lisp's homoiconicity.

## 1. The Macro Expansion Pipeline

HQL's design involves a sophisticated transformation pipeline:

1. **Parsing**: The parser preserves extended syntax by generating specialized AST nodes
2. **Macro Expansion**: These nodes are transformed into canonical S-expressions
3. **IR Generation**: The canonical forms are converted to an intermediate representation
4. **Code Generation**: The IR is transformed into JavaScript/TypeScript

Unlike traditional Lisps that immediately desugar during parsing, HQL maintains the original syntax in the AST, enabling a more modular and user-extensible transformation system.

## 2. Data Structure Literals

### JSON Object Syntax

```lisp
;; User writes this JSON-like syntax:
(def user {"name": "Alice", "age": 30})

;; The macro system transforms it to:
(def user (hash-map (keyword "name") "Alice" (keyword "age") 30))

;; Which compiles to JavaScript:
const user = { name: "Alice", age: 30 };
```

### Array Syntax

```lisp
;; User writes this array literal:
(def numbers [1, 2, 3, 4, 5])

;; The macro system transforms it to:
(def numbers (vector 1 2 3 4 5))

;; Which compiles to JavaScript:
const numbers = [1, 2, 3, 4, 5];
```

### Set Syntax

```lisp
;; User writes this set literal:
(def unique-ids #[1001, 1002, 1003])

;; The macro system transforms it to:
(def unique-ids (new Set (vector 1001 1002 1003)))

;; Which compiles to JavaScript:
const uniqueIds = new Set([1001, 1002, 1003]);
```

## 3. Extended Function Definition with `fx`

The `fx` macro provides a rich function definition syntax that supports:
- Type annotations for parameters
- Default parameter values
- Named parameters
- Return type annotations

```lisp
;; User writes this extended function:
(fx calculate-area (width: Number height: Number = 10) -> Number
  (* width height))

;; The macro system transforms it to:
(defun calculate-area (width &optional (height 10))
  (* width height))

;; If using named parameters:
(fx format-user (name: String age: Number) -> String
  (str name " is " age " years old"))

;; Gets transformed to handle named parameter destructuring:
(defun format-user (params)
  (let [{name age} params]
    (str name " is " age " years old")))
```

## 4. Implementation Details

### Parser Preservation

The parser maintains raw syntax by introducing specialized node types:
- `JsonObjectLiteralNode` for object literals
- `JsonArrayLiteralNode` for array literals
- `ExtendedDefnNode` for `fx` expressions

### Macro Registration

The macro system uses a registry to define transformations:

```typescript
// Simplified from src/macro.ts
export function defineMacro(name: string, macroFn: MacroFunction): void {
  macroRegistry.set(name, macroFn);
}

// Define the fx macro
defineMacro("fx", (node: ListNode): HQLNode => {
  // Extract function name, params, body
  // Transform into canonical defun form
  // Handle type annotations, defaults, etc.
});
```

### Transpilation Process

1. `parse()` creates the AST with raw syntax nodes
2. `expandMacros()` transforms these into canonical forms
3. `transformToIR()` converts canonical forms to IR
4. `convertIRToTSAST()` converts IR to TypeScript AST
5. `generateTypeScript()` produces the final code

## 5. Benefits of This Approach

1. **User Experience**: Write expressive code that feels natural
2. **Direct Mapping**: Object and array literals map directly to JavaScript
3. **Extensibility**: The macro system can be extended by users
4. **Performance**: Minimal runtime overhead as all transformations happen at compile time

## 6. Future Directions

The current implementation already provides a robust foundation, but future enhancements could include:

1. User-defined macros with `defmacro`
2. More sophisticated pattern matching for macro expansion
3. Advanced compile-time code analysis and optimization
4. Improved error reporting during macro expansion

## 7. Example: Complete Macro Expansion

Let's trace the complete transformation of a complex HQL expression:

```lisp
;; Original HQL code
(fx process-user (user-id: Number)
  (let [
    user {"name": "Alice", "settings": {"theme": "dark"}}
    processed-name (get user "name")
  ]
    {"user": processed-name, "id": user-id}
  ))
```

After macro expansion, this becomes:

```lisp
;; After first-level expansion
(defun process-user (params)
  (let [{user-id} params]
    (let [
      user (hash-map (keyword "name") "Alice" 
                     (keyword "settings") (hash-map (keyword "theme") "dark"))
      processed-name (get user "name")
    ]
      (hash-map (keyword "user") processed-name (keyword "id") user-id)
    )))
```

The transpiler then converts this canonical form through IR into JavaScript:

```javascript
function processUser({ userId }) {
  const user = { name: "Alice", settings: { theme: "dark" } };
  const processedName = user.name;
  return { user: processedName, id: userId };
}
```

This demonstrates how HQL's macro system enables expressive syntax while generating clean, efficient JavaScript.