;; circular-multihop/c.hql
(import [aBase] from "./a.hql")

(fn cFunc ()
  (+ 3 aBase))

(export [cFunc])

