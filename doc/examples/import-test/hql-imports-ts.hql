;; hql-imports-ts.hql - HQL file importing TS
;; Note: Direct TS imports are not currently supported
;; (import [baseTsFunction] from "./base.ts")
;; Using JS instead
(import [baseHqlFunction] from "./base.js")

(console.log "HQL importing JS test (TS not directly supported)")
(console.log "Result:" (baseHqlFunction 10)) 