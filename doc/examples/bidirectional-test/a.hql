;; HQL module that gets imported by TypeScript (a.hql)
;; Uses correct HQL syntax: fn with parentheses, var instead of def

;; Define a function that will be exported to TypeScript
(fn hqlAdd (x)
  (console.log "HQL function hqlAdd called with:" x)
  (+ x 10))

;; A utility function
(fn hqlMultiply (x y)
  (console.log "HQL function hqlMultiply called with:" x "and" y)
  (* x y))

;; Export the functions for TypeScript to import
(export "hqlAdd" hqlAdd)
(export "hqlMultiply" hqlMultiply)

;; Export a constant
(var HQL_VERSION "1.0.0")
(export "HQL_VERSION" HQL_VERSION) 