;; export-alias.hql
(fn add4 (a b) (+ a b))
(fn add10 (a) (+ a 10))

(export [add4 as add])
(export [add10])

;; Usage example for import
;; (import { add } from "./export-alias.hql")
;; (print (add 1 2)) ;; Should print 3
