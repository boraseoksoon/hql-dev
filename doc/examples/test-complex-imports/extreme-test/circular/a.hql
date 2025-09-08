;; Extreme test circular dependency - a.hql
(var circularValue 10)
(import [incrementCircular] from "./b.hql")

(fn circularFunction ()
  (incrementCircular circularValue))

;; For entry-simpler.hql which imports [myFunction as circularFunction]
(fn myFunction ()
  (circularFunction))

(export [circularValue])
(export [circularFunction])
(export [myFunction])

