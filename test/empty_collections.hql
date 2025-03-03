;; test/empty_collections.hql
;; Test file specifically for empty collections

;; Define empty vector and other vectors
(def empty-vector [])
(def single-item-vector [1])
(def multi-item-vector [1, 2, 3])

;; Define empty map and other maps
(def empty-map {})
(def single-key-map {"key": "value"})
(def multi-key-map {"key1": "value1", "key2": "value2"})

;; Define empty set and other sets
(def empty-set #[])
(def single-item-set #[1])
(def multi-item-set #[1, 2, 3])

;; Print all collections to verify they work
(print "Empty vector:" empty-vector)
(print "Single item vector:" single-item-vector)
(print "Multi-item vector:" multi-item-vector)

(print "Empty map:" empty-map)
(print "Single key map:" single-key-map)
(print "Multi-key map:" multi-key-map)

(print "Empty set:" empty-set)
(print "Single item set:" single-item-set)
(print "Multi-item set:" multi-item-set)

;; Test construction of empty collections
(def constructed-empty-vector (vector))
(def constructed-empty-map (hash-map))
(def constructed-empty-set (new Set []))

(print "Constructed empty vector:" constructed-empty-vector)
(print "Constructed empty map:" constructed-empty-map)
(print "Constructed empty set:" constructed-empty-set)

;; Test operations on empty collections
(print "Empty vector length:" (js/Array empty-vector.length))
(print "Empty set size:" (get empty-set "size"))
(print "Empty map keys:" (js/Object.keys empty-map))

;; Test pass-through in functions
(defn process-collections (vec: Array map: Object set: Object)
  (hash-map
    (keyword "vectorLength") (js/Array vec.length)
    (keyword "mapKeys") (js/Object.keys map)
    (keyword "setSize") (get set "size")
  )
)

(print "Process empty collections:" 
  (process-collections vec: empty-vector map: empty-map set: empty-set))
(print "Process non-empty collections:" 
  (process-collections vec: multi-item-vector map: multi-key-map set: multi-item-set))

(print "Test complete")