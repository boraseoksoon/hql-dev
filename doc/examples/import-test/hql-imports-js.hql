;; hql-imports-js.hql - HQL file importing JS
(import [baseJsFunction] from "./base.js")

(console.log "HQL importing JS test")
(let result (baseJsFunction 10))
(console.log "Result:" result) 