;; Extreme test simple circular dependency - b.hql
(import [circularValue] from "./a.hql")

(fn incrementCircular (value)
  (+ value circularValue))

(export [incrementCircular])

