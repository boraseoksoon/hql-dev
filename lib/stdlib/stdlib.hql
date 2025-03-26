;; lib/stdlib/stdlib.hql - HQL wrapper over the JavaScript implementation

(import [_take, _map, _filter, _reduce, _range, _rangeGenerator, _groupBy, _keys] from "./js/stdlib.js")

;; Take n items from a collection
(defn take (n coll)
  (_take n coll))

;; Map a function over a collection
(defn map (f coll)
  (_map f coll))

;; Filter a collection with a predicate
(defn filter (pred coll)
  (_filter pred coll))

;; Reduce a collection with a function and initial value
(defn reduce (f init coll)
  (_reduce f init coll))

;; Range function that uses generators for lazy evaluation
;; - (range end): 0 to end-1
;; - (range start end): start to end-1 
;; - (range start end step): start to end-1 with step
(defn range (& args)
  (cond
    ((= (length args) 0) (_rangeGenerator 0 Infinity 1))  ;; Infinite sequence
    ((= (length args) 1) (_rangeGenerator 0 (first args) 1))
    ((= (length args) 2) (_rangeGenerator (first args) (second args) 1))
    (true (_rangeGenerator (first args) (second args) (nth args 2)))))

;; Group collection elements by function results
(defn groupBy (f coll)
  (_groupBy f coll))

;; Get keys from an object
(defn keys (obj)
  (_keys obj))

;; Export functions
(export [take])
(export [map, filter, reduce, range, groupBy, keys])