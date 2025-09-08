;; Extreme test simple circular dependency - a.hql
(var circularValue 10)
(import [incrementCircular] from "./b.hql")

(fn circularFunction ()
  (incrementCircular circularValue))

(export [circularValue])
(export [circularFunction])

