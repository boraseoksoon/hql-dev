;; circular-js-hql/a.hql — HQL↔JS circular
(var base 5)
(import [incByBase] from "./b.js")

(fn aFunc ()
  (incByBase base))

(export [base])
(export [aFunc])

