;; complex-imports.hql - Various import styles
;; Named imports with aliases
(import [baseHqlFunction as hqlFunc, baseJsFunction as jsFunc] from "./intermediate.hql")

;; Remote modules examples
(import _ from "npm:lodash")

(console.log "Complex imports test")
(console.log "HQL function with alias:" (hqlFunc 5))
(console.log "JS function with alias:" (jsFunc 5))
(console.log "Lodash version:" _.VERSION)
;; Use lambda for anonymous functions
(console.log "Mapped array:" (_.map [1, 2, 3] (lambda (x) (* x 2)))) 