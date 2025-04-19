;; Circular dependency test - File A (Simple version)
;; This file imports from B, which imports from A (circular)

;; Define the value first and export it immediately
(var valueA 100)
(export [valueA])

;; Import from B which will import back to A
(import [incrementValue] from "./b.hql")

;; Function that uses the imported function
(fn useImportedFunction (x)
  (+ x (incrementValue valueA)))

;; Test the function
(console.log "From a.hql: Result of useImportedFunction(50):" (useImportedFunction 50)) 