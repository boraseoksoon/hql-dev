──────────────────────────── Part 2: Function Model (fx, fn, lambda) ────────────────────────────

Overview
We distinguish functions by both their naming and their purity:

fx:
Purpose: Define named pure functions.
Semantics:
• Must be completely self‑contained: can use only its parameters and local immutable bindings (created by let).
• It must not capture any external binding or produce side effects (such as I/O, logging, or updating mutable state).
Usage: Use fx when you want strong purity guarantees.
fn:
Purpose: Define named functions that allow side effects and mutable state (a general-purpose function, similar to Clojure’s defn).
Semantics:
• No purity enforcement; these functions can capture external variables and perform side effects.
Usage: Use fn when you do not require the function to be pure.
lambda:
Purpose: Define anonymous functions (lambdas).
Semantics:
• There is one unified lambda form for all anonymous functions.
• Its purity is determined by its body; when passed as an argument to a pure function (fx), the lambda is statically checked for purity.
• There is no separate form for impure lambdas.
Usage: Use lambda for inline anonymous functions. In a pure context (like as an argument to an fx function), the lambda must be pure; otherwise, an error is raised.
Showcase Examples
Allowed Pure Function Examples (fx and lambda)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Pure Named Function using fx
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(fx add (a b)
  (+ a b))
(print "Pure add result:" (add 3 4))
;; OK: 'add' depends only on its parameters.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Pure Function with Local Binding
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(fx pure-with-local (n)
  (let (localConst 10)
    (+ n localConst)))
(print "Pure with local result:" (pure-with-local 5))
;; OK: All dependencies are defined inside the function.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Pure Function Accepting a Pure Lambda
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(fx apply-lambda (n f)
  (f n))
(print "Applying pure lambda:" (apply-lambda 5 (lambda (x) (* x 3))))
;; OK: The lambda is pure since it depends only on its parameter.
Allowed Impure Function Examples (fn)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Impure Named Function using fn
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(fn logger (msg)
  (print "Logging:" msg)
  msg)
(print "Logger output:" ((fn logger (msg) (print "Logging:" msg) msg) "Hello, world"))
;; OK: This function may capture external state or perform side effects.
Disallowed Cases in Pure Functions (fx)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Disallowed Pure Function: Capturing External Value
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(let externalConst 42)
(fx impure-capture (n)
  (+ n externalConst))
;; ERROR: impure-capture is rejected because it captures externalConst,
;; even though externalConst is immutable. All dependencies must be passed as parameters.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Disallowed Pure Function: Side Effects
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(fx impure-side-effect (n)
  (print "Side effect:" n)   ;; ERROR: Using print is a side effect.
  (+ n 1))
;; ERROR: impure-side-effect is not pure.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Disallowed Pure Function: Accepting an Impure Lambda
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Define an impure anonymous function using fn.
(fn impureLambda (x)
  (print "Impure lambda:" x)
  (+ x 2))
;; Then, in a pure fx function, passing impureLambda should be rejected:
(fx use-lambda (n f)
  (f n))
;; ERROR: use-lambda must only accept pure lambdas; passing impureLambda violates purity.
Summary of the Function Model
fx:
Used for defining named pure functions.
Enforces that functions are self‑contained and free of side effects or external state.
fn:
Used for defining named functions without purity guarantees (allowing side effects and external capture).
lambda:
A unified form for anonymous functions.
When used in pure contexts (e.g., passed to an fx function), it is statically checked for purity.
Key Takeaways
Bindings:
let creates immutable bindings (with automatic freezing for objects), while var creates mutable ones.
Function Definitions:
Named pure functions (fx) and impure functions (fn) are separated, which helps enforce purity at module boundaries.
Anonymous functions are defined using lambda. They are not split into separate pure and impure forms; their purity is determined by context (pure lambdas must be used where required).
Purity Enforcement:
Pure functions (fx) must not capture any external state or perform side effects.
If a lambda passed to an fx function is impure, the system should flag an error.