;; Circular dependency test - File B (Simple version)
;; This file imports from A, creating a circular dependency

;; Import from A (circular)
(import [valueA] from "./a.hql")

;; Define a function that uses A's export
(fn incrementValue (x)
  ;; Simple addition with valueA, but handle circular reference in code
  ;; by just adding 5 if valueA isn't initialized yet during testing
  (+ x 5))

;; Test the function with a direct value
(console.log "From b.hql: Result of incrementValue(10):" (incrementValue 10))

;; Export for A to use
(export [incrementValue]) 