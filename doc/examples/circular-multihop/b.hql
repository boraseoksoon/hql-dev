;; circular-multihop/b.hql
(import [cFunc] from "./c.hql")

(fn bFunc ()
  (+ 2 (cFunc)))

(export [bFunc])

