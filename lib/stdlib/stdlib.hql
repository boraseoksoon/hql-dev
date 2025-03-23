;; stdlib.hql - HQL wrapper over the JavaScript implementation

(import [_take, _drop] from "./stdlib.js")

;; Define as regular functions (not macros)
(defn take (n coll)
  (_take n coll))

(defn drop (n coll)
  (_drop n coll))

;; Export using the vector syntax
(export [take, drop])