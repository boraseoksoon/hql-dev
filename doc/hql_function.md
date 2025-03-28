──────────────────────────── Part 1: Function Model (fx, fn, lambda)
────────────────────────────

**Overview:** We distinguish functions by both their naming and their purity:

- **fx:**  
  **Purpose:** Define named and typed pure functions.  
  **Semantics:**  
  - Must be completely self‑contained: can use only its parameters and local immutable bindings (created by `let`).  
  - Must not capture any external binding or produce side effects (such as I/O, logging, or updating mutable state).  
  **Usage:** Use `fx` when you want strong purity guarantees.  
  **Note:** All `fx` functions are fully typed; there is no support for untyped `fx` definitions.

- **fn:**  
  **Purpose:** Define named functions that allow side effects and mutable state (a general-purpose function, similar to Clojure’s defn).  
  **Semantics:**  
  - No purity enforcement; these functions can capture external variables and perform side effects.  
  **Usage:** Use `fn` when you do not require the function to be pure.

- **lambda:**  
  **Purpose:** Define anonymous functions.  
  **Semantics:**  
  - There is one unified lambda form for all anonymous functions.  
  - Its purity is determined by its body; when passed as an argument to a pure function (`fx`), the lambda is statically checked for purity.  
  - There is no separate form for impure lambdas.  
  **Usage:** Use `lambda` for inline anonymous functions. In a pure context (like as an argument to an `fx` function), the lambda must be pure; otherwise, an error is raised.

**Showcase Examples**

**Allowed Pure Function Examples (fx and lambda):**

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Pure Named Function using fx (typed only)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

```lisp
(fx add (a: Int b: Int) (-> Int)
  (+ a b))
(print "Pure add result:" (add x: 3 y: 4))
```

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Pure Function with Local Binding
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

```lisp
(fx pure-with-local (n: Int) (-> Int)
  (let (localConst 10)
    (+ n localConst)))
(print "Pure with local result:" (pure-with-local x: 5))
```

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Pure Function Accepting a Pure Lambda
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

```lisp
(fx apply-lambda (n: Int f: (-> Int Int)) (-> Int)
  (f n))
(print "Applying pure lambda:" (apply-lambda x: 5 f: (lambda (x: Int) (-> Int) (* x 3))))
```

**Allowed Impure Function Examples (using fn and lambda):**

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Impure Named Function using fn
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

```lisp
(fn logger (msg: String) (-> String)
  (print "Logging:" msg)
  msg)
(print "Logger output:" ((lambda logger (msg: String) (-> String)
                             (print "Logging:" msg)
                             msg) x: "Hello, world"))
```

**Disallowed Cases in Pure Functions (fx):**

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Disallowed Pure Function: Capturing External Value
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

```lisp
(let externalConst 42)
(fx impure-capture (n: Int) (-> Int)
  (+ n externalConst))  ; ERROR: impure-capture is rejected because it captures externalConst.
```

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Disallowed Pure Function: Side Effects
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

```lisp
(fx impure-side-effect (n: Int) (-> Int)
  (print "Side effect:" n)  ; ERROR: Using print is a side effect.
  (+ n 1))
```

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Disallowed Pure Function: Accepting an Impure Lambda
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

```lisp
; Define an impure anonymous function using fn.
(lambda impureLambda (x: Int) (-> Int)
  (print "Impure lambda:" x)
  (+ x 2))
; Then, in a pure fx function, passing impureLambda should be rejected:
(fx use-lambda (n: Int f: (-> Int Int)) (-> Int)
  (f n))  ; ERROR: use-lambda must only accept pure lambdas; passing impureLambda violates purity.
```

**Summary of the Function Model**

- **fx:** Used for defining named pure functions. All definitions are fully typed and must not capture any external state or perform side effects.
- **fn:** Used for defining named functions without purity guarantees (allowing side effects and external capture).
- **lambda:** A unified form for anonymous functions. When used in pure contexts (e.g., passed to an `fx` function), the lambda is statically checked for purity.

**Key Takeaways**

- **Bindings:** `let` creates immutable bindings (with automatic freezing for objects), while `var` creates mutable ones.
- **Function Definitions:** Pure functions (`fx`) and impure functions (`fn`) are clearly separated, which helps enforce purity at module boundaries.
- **Anonymous Functions:** Defined using `lambda`. Their purity is determined by context; pure lambdas must be used where required.
- **Purity Enforcement:** Pure functions (`fx`) must not capture any external state or perform side effects. If a lambda passed to an `fx` function is impure, the system should flag an error.

This comprehensive split overview and refined syntax showcase the vision for HQL’s design while reducing complexity by ensuring that all `fx` functions are fully typed.