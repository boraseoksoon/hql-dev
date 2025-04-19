;; Circular dependency test file (b.hql)
;; This file imports a.hql, which in turn imports back to this file

(import [myFunction] from "./a.hql")

;; Define a function that uses the imported function
(fn incrementCircular (x)
  (+ (myFunction x) 1))

;; Test the imported function with a literal value
(console.log "Direct result from b.hql:" (myFunction 20))

;; Export our incrementCircular function for a.hql
(export [incrementCircular])
