;; stdlib.hql - HQL wrapper over the JavaScript implementation

(import [_take] from "./stdlib.js")

;; Define as regular functions (not macros)
(defn take (n coll)
  (_take n coll))

(export [take])