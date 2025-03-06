;; simple.hql

;; fx function: With type annotations, must be transpiled to use object destructuring.
(fx calculate-area (width: Int height: Int) (-> Int)
  (* width height))

(print (calculate-area width: 5 height: 10))

(fx add (x: Int y: Int) (-> Int)
  (+ x y))
  
(print "Sum of 3 and 4 (defn): " (add x: 10 y: 20))

(fx process-data (data: Int options: Object) (-> Int)
  (* data (get options "factor")))

(print "Processed data (fx): " (process-data data: 100 options: (hash-map (keyword "factor") 1.5)))
