;; Circular dependency test - File B
;; This file imports from A, creating a circular dependency

;; Import from A (circular)
(import [circularValue] from "./a.hql")

;; Define a function that uses A's export
(fn incrementCircular (value)
  (+ value circularValue))

;; Export for A to use
(export [incrementCircular]) 