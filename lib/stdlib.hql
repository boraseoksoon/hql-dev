;; stdlib.hql

(defn reduce (coll f init)
  (js/Array.prototype.reduce.call coll f init))

(defn map (f coll)
  (js/Array.prototype.map.call coll f))

(defn filter (pred coll)
  (js/Array.prototype.filter.call coll pred))