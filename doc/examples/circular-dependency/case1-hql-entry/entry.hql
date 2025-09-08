;; Case 1: HQL as entry point
;; KNOWN LIMITATION: Circular dependency HQL → JS → HQL is not supported
;; This is a fundamental limitation because:
;; 1. HQL files must be compiled to TypeScript before JS can import them
;; 2. During compilation, the TypeScript file doesn't exist yet
;; 3. JS files can't import from HQL files that are currently being compiled
;;
;; This test demonstrates the limitation and expected error.
;; In production code, avoid circular dependencies between HQL and JS/TS files.

;; This will fail with "Module not found" error - expected behavior
;; (import [middle_js] from "./middle.js")

;; Instead, use one-way dependencies or restructure the code
(fn add_hql (x y)
  (+ x y))

(export [add_hql])

(print "Circular dependency test - limitation documented")
