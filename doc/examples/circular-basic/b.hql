;; circular-basic/b.hql - Part of a minimal circular dependency
;; Imports a value from a.hql and exports a function that uses it

(import [circularValue] from "./a.hql")

(fn incrementCircular (value)
  (+ value circularValue))

(export [incrementCircular])

