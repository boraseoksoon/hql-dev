;; circular-test.hql - Tests circular dependencies
(import [functionA] from "./circular-a.hql")
(import [functionB] from "./circular-b.hql")

(console.log "Circular dependency test")
(console.log "functionA(5):" (functionA 5))
(console.log "functionB(5):" (functionB 5)) 