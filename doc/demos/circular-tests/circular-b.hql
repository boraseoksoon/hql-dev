;; circular-b.hql - Part of circular dependency
(import [functionA] from "./circular-a.hql")

(fn functionB (x)
  (if (< x 2)
    x
    (- x (functionA (- x 1)))))

(export [functionB])

(console.log "circular-b.hql loaded") 