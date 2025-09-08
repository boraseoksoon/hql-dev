;; Circular dependency test file (a.hql)
;; This file imports b.hql, which in turn imports back to this file

(import [incrementCircular] from "./b.hql")

(fn myFunction (x)
  (+ x 10))

(fn getValueFromFunction (x)
  (myFunction x))

;; This is a function call, not a collection access  
(console.log "Result of function call:" (getValueFromFunction 5))

;; Test the imported function (circular dependency)
(console.log "Result of circular import function:" (incrementCircular 10))

;; Create a collection to test collection access
(var myCollection ["a" "b" "c"])

;; This is a collection access, not a function call
(console.log "Element from collection:" (myCollection 1))

;; Export functions for b.hql
(export [myFunction])
