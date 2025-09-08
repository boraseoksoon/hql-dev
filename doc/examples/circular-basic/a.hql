;; circular-basic/a.hql - Part of a minimal circular dependency
;; Exports a value and a function that uses a value from b.hql indirectly

;; Define a value that will be used by b.hql
(var circularValue 10)

;; Import a function from b.hql that depends back on this module
(import [incrementCircular] from "./b.hql")

;; Function that exercises the circular dependency
(fn circularFunction ()
  (var result (incrementCircular circularValue))
  result)

(export [circularValue])
(export [circularFunction])

