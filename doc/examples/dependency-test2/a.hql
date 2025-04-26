;; a.hql
(import [add as add4] from "./b.js")

(print (add4 1 2))
(import module from "./z.hql")
(print (module.add2 1000 2000))

(fn minus (x y) (- x y))

(export [add4 as add10, add4 as add, minus])
