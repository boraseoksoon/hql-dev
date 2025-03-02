;; test/data_structures.hql - Testing the new data structure literals

;; List (using standard S-expression)
(def my-list (list 1 2 3 4 5))
(print "Standard list:" my-list)

;; Vector (using new syntax)
(def my-vector [10 20 30 40 50])
(print "Vector literal:" my-vector)

;; Map (using JSON literal)
(def my-map {"name": "Alice", "age": 30, "skills": ["JavaScript", "HQL", "Clojure"]})
(print "Map literal:" my-map)

;; Set (using new syntax)
(def my-set #[1 2 3 3 4 4 5])  ;; Duplicates will be removed
(print "Set literal:" my-set)

;; Using them in functions
(defn process-data (data)
  (let [
    ;; Vector operations
    vec-transformed (map my-vector (fn [x] (* x 2)))
    
    ;; Map operations
    name (get my-map "name")
    skills (get my-map "skills")
    
    ;; Set operations
    set-with-more (new Set (concat (js/Array.from my-set) [6 7 8]))
  ]
    (hash-map
      (keyword "vector-doubled") vec-transformed
      (keyword "user-name") name
      (keyword "user-skills") skills
      (keyword "expanded-set") set-with-more
    )
  )
)

;; Display results
(print "Processing results:" (process-data my-map))

;; Export our definitions
(export "myList" my-list)
(export "myVector" my-vector)
(export "myMap" my-map)
(export "mySet" my-set)
(export "processData" process-data)