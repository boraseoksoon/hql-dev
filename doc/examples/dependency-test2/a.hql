;; a.hql
(import [add as add4] from "./b.js")

(print (add4 1 2))
(import module from "./z.hql")
(print (module.add2 1000 2000))

(export [add4 as add])
(export [add4 as add10])
