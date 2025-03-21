;; b.hql

(import [greeting, farewell] from "./a.hql")
(import [greeting as greeting_c, farewell2] from "./c.hql")

(greeting "World")
(farewell "Friends")

(greeting_c "World2")
(farewell2 "Friends2")