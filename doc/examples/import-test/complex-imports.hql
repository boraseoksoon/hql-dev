;; complex-imports.hql - Various import styles
;; Named imports with aliases
(import [baseHqlFunction as hqlFunc, baseJsFunction as jsFunc] from "./intermediate.hql")

;; Remote modules examples
(import lodash from "npm:lodash")
(import [map, filter] from "npm:lodash")

(console.log "Complex imports test")
(console.log "HQL function with alias:" (hqlFunc 5))
(console.log "JS function with alias:" (jsFunc 5))
(console.log "Lodash version:" lodash.VERSION)
(console.log "Mapped array:" (map [1, 2, 3] (fn (x) (* x 2)))) 