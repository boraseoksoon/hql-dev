;; b.hql

(import [greeting, farewell] from "./a.hql")
(import [greeting2 as greeting, farewell2] from "./c.hql")

(greeting "World")
(farewell "Friends")

(greeting "World2")
(farewell2 "Friends2")