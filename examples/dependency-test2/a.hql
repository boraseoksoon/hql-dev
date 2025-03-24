;; a.hql
(import [add] from "./b.js")
(print (add 1 2))

(import module from "./z.hql")
(print (module.add2 1000 2000))
