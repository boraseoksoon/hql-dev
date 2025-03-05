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

(defn average (nums)
  (let [
    sum (reduce nums (fn (acc val) (+ acc val)) 0)
    count nums.length
  ]
    (/ sum count)
  )
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

;; Helper function to reduce an array
(defn reduce (array fn initial)
  (let [
    result initial
  ]
    (js/Array array.forEach (fn (item) 
      (set result (fn result item))
    ))
    result
  )
)

;; Export functions
(export "add" add)
(export "subtract" subtract)
(export "multiply" multiply)
(export "divide" divide)
(export "square" square)
(export "cube" cube)
(export "average" average)
(export "calculate" calculate)