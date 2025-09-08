;; Moved demo: complex import styles (not a standalone test)
(import [baseHqlFunction as hqlFunc, baseJsFunction as jsFunc] from "../examples/import-test/intermediate.hql")
(import _ from "npm:lodash")

(console.log "Complex imports test (demo)")
(console.log "HQL function with alias:" (hqlFunc 5))
(console.log "JS function with alias:" (jsFunc 5))
(console.log "Lodash version:" _.VERSION)
(console.log "Mapped array:" (_.map [1, 2, 3] (lambda (x) (* x 2))))
