;; deep-level1.hql - First level in the deep nesting test

;; Import from JS file (second level)
(import [processNumber] from "./deep-level2.js")

;; Define function that uses the import
(fn getNestedCalculation (x)
  (let processed (processNumber x))
  (+ processed 5))

;; Export the function
(export [getNestedCalculation])

(console.log "deep-level1.hql loaded") 