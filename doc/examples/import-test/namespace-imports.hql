;; namespace-imports.hql - Using namespace imports
(import baseModule from "./base.hql")
(import jsModule from "./base.js")

(console.log "Namespace imports test")
(console.log "HQL function result:" (baseModule.baseHqlFunction 10))
(console.log "JS function result:" (jsModule.baseJsFunction 10)) 