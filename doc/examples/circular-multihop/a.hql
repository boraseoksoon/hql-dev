;; circular-multihop/a.hql
(var aBase 1)
(import [bFunc] from "./b.hql")

(fn aFunc ()
  (+ aBase (bFunc)))

(export [aBase])
(export [aFunc])

