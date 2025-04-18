;; intermediate.hql - Imports from both JS and HQL files
(import [baseJsFunction] from "./base.js")
(import [baseHqlFunction] from "./base.hql")

(fn combinedFunction (x)
  (+ (baseJsFunction x) (baseHqlFunction x)))

(export [combinedFunction, baseJsFunction, baseHqlFunction])

(console.log "intermediate.hql loaded") 