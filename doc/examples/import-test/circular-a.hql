;; circular-a.hql - Part of circular dependency
(import [functionB] from "./circular-b.hql")

(fn functionA (x)
  (if (< x 2)
    x
    (+ x (functionB (- x 1)))))

(export [functionA])

(console.log "circular-a.hql loaded") 