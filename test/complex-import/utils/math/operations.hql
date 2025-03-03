;; test/complex-import/utils/math/operations.hql

;; Basic arithmetic functions
(defn add (a b)
  (+ a b)
)

(defn subtract (a b)
  (- a b)
)

(defn multiply (a b)
  (* a b)
)

(defn divide (a b)
  (/ a b)
)

;; Advanced calculations
(defn square (x)
  (* x x)
)

(defn cube (x)
  (* x x x)
)

;; Utility function that uses multiple operations
(defn calculate (value factor)
  (let [
    squared (square value)
    multiplied (multiply squared factor)
    result (add multiplied 10)
  ]
    (hash-map
      (keyword "input") value
      (keyword "factor") factor
      (keyword "squared") squared
      (keyword "multiplied") multiplied
      (keyword "result") result
    )
  )
)

;; Export functions
(export "add" add)
(export "subtract" subtract)
(export "multiply" multiply)
(export "divide" divide)
(export "square" square)
(export "cube" cube)
(export "calculate" calculate)