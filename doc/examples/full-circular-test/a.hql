;; Starting point for circular dependency test (a.hql)
;; This file doesn't directly import b.ts to avoid circular dependency issues

;; Define a function that will be exported
(defn hqlFunction [x]
  (console.log "HQL function called with:" x)
  (+ x 10))

;; Wrapper function to test circular imports
(defn testWithInput [x]
  (console.log "HQL wrapper function called with:" x)
  ;; Here we would normally call a TypeScript function
  ;; but we'll skip direct circular imports
  (def result (+ x 10))
  (console.log "HQL wrapper calculated:" result)
  result)

;; Export both functions 
(export [hqlFunction testWithInput]) 