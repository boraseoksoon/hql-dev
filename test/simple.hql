;; simple.hql

;; fx function: With type annotations, must be transpiled to use object destructuring.
(fx calculate-area (width: Int height: Int) -> Int
  (* width height))
(print "Area of 5x10 rectangle (fx): " (calculate-area width: 5 height: 10))

;; defn function: Untyped and positional.
(defn add (x y)
  (+ x y))
(print "Sum of 3 and 4 (defn): " (add 3 4))

;; fx function: With nested object usage.
(fx process-data (data: Int options: Object) -> Int
  (* data (get options "factor")))
(print "Processed data (fx): " (process-data data: 100 options: (hash-map (keyword "factor") 1.5)))
