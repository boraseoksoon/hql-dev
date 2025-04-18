;; nested-imports.hql - Imports from intermediate.hql
(import [combinedFunction] from "./intermediate.hql")

(console.log "Nested imports test")
(console.log "Result:" (combinedFunction 10)) 