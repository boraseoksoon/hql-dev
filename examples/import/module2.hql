;; module2.hql

(import [add, multiply] from "./module1.hql")
(import [divide as div2] from "./module1.hql")

(console.log "2 + 3 =" (add 2 3))
(console.log "4 * 5 =" (multiply 4 5))
(console.log "10 / 2 =" (div 10 2))