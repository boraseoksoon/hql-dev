;; HQL Circular Module
;; This demonstrates circular dependencies

;; Import from JavaScript (circular reference)
(import [tsCircularFunction] from "./entry.js")

;; Function that creates circular reference
(fn hqlCircularFunction (input)
  (console.log "HQL circular function called with:" input)
  
  ;; Call JavaScript function that imported this module
  (var tsResult (tsCircularFunction input))
  
  ;; Return a composed result
  (+ "HQL circular: " input " -> TS: " tsResult))

;; Export for JavaScript to import
(export [hqlCircularFunction]) 