;; hql-imports-js.hql - HQL file importing JS
(import [baseHqlFunction] from "./base.js")

(console.log "HQL importing JS test")
(let result (baseHqlFunction 10))
(console.log "Result:" result) 