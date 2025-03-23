;; stdlib.hql - HQL wrapper over the JavaScript implementation

(import [_take] from "./stdlib.js")
(import [_map, _filter, _reduce, _range, _rangeGenerator, _groupBy, _keys] from "./stdlib.js")

(defn take (n coll)
  (_take n coll))

(defn map (f coll)
  (_map f coll))

(defn filter (pred coll)
  (_filter pred coll))

(defn reduce (f init coll)
  (_reduce f init coll))

(defn groupBy (f coll)
  (_groupBy f coll))

(defn keys (obj)
  (_keys obj))

(export [take])
(export [map, filter, reduce, groupBy, keys])