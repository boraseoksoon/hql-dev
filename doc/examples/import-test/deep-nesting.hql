;; deep-nesting.hql - Tests deep nesting of imports across HQL/JS/TS

;; Import from the first level (will trigger cascading imports)
(import [getNestedCalculation] from "./deep-level1.hql")

(console.log "Deep Nesting Import Test")
(console.log "Result of deeply nested calculations:" (getNestedCalculation 10))

;; Test a complex nested calculation that involves all file types
(fn complexCalculation (x)
  (let level1 (getNestedCalculation x))
  (let level2 (* level1 2))
  (let level3 (+ level2 5))
  level3)

(console.log "Complex calculation result:" (complexCalculation 5)) 