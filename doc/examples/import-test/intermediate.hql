;; intermediate.hql - Imports from both JS and HQL files
;; Import the same function (baseHqlFunction is exported from base.js)
(import [baseHqlFunction as baseJsFunction] from "./base.js")
(import [baseHqlFunction] from "./base.hql")

(fn combinedFunction (x)
  (+ (baseJsFunction x) (baseHqlFunction x)))

(export [combinedFunction, baseJsFunction, baseHqlFunction])

(console.log "intermediate.hql loaded") 