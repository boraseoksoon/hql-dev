;; Circular dependency test - File A
;; This file imports from B, which imports from A (circular)

;; Forward declaration to handle circular dependency
(var circularValue 10)

;; Import from B which will import back to A
(import [incrementCircular] from "./b.hql")

;; Define the exported function that uses B's function
(fn circularFunction ()
  (var result (incrementCircular circularValue))
  (+ result 5))

;; Export the value for B to use
(export [circularValue])
(export [circularFunction]) 