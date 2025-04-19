;; Middle HQL file in Case 2
;; This demonstrates circular dependency where JS → HQL → TS → JS

;; Import the TypeScript file that will be part of the cycle
(import [modulo_ts] from "./final.ts")

;; Define a simple subtraction function
(fn subtract_hql (x y)
  (- x y))

;; Export the function for use in other modules
(export subtract_hql)

;; Test the circular dependency
(print "HQL middle result: " (modulo_ts 17 5))
