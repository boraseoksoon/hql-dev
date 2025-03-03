;; test/extended_defn_sample.hql
;; Comprehensive test file for extended defn syntax 

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 1: Basic Type Annotations
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Basic function with explicit parameter types
(defn add1 (x: Number y: Number)
  (+ x y))

;; Function with explicit return type
(defn add2 (x: Number y: Number) -> Number
  (+ x y))

;; Function with inferred types (no annotations)
(defn add3 (x y)
  (+ x y))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 2: Default Parameter Values
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Function with default parameter values
(defn add-with-default (x: Number y: Number = 0)
  (+ x y))

;; Function with multiple default values
(defn format-name (first: String last: String title: String = "Mr." suffix: String = "")
  (str title " " first " " last suffix))

;; Function with return type and default values
(defn calculate-interest (principal: Number rate: Number = 0.05 years: Number = 1) -> Number
  (* principal (Math.pow (+ 1 rate) years)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 3: Named Parameters
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Define functions using named parameters
(defn rectangle-area (width: Number height: Number) -> Number
  (* width height))

(defn format-address (street: String city: String state: String zip: String)
  (str street ", " city ", " state " " zip))

;; Call functions with named parameters
(print "Area:" (rectangle-area width: 10 height: 20))
(print "Address:" (format-address 
  street: "123 Main St" 
  city: "Springfield" 
  state: "IL" 
  zip: "62701"))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 4: Anonymous Functions with Types
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Anonymous function with parameter types and return type
(def multiply 
  (fn (a: Number b: Number) -> Number 
    (* a b)))

;; Higher-order function with type annotations
(defn make-adder (n: Number) -> (-> Number Number)
  (fn (x: Number) -> Number
    (+ x n)))

;; Test higher-order function
(def add-five (make-adder 5))
(print "5 + 10 =" (add-five 10))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 5: Complex Function Examples
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Complex function with type annotations, default values, and return type
(defn calculate-total-price (
  base-price: Number 
  quantity: Number = 1 
  tax-rate: Number = 0.0825 
  discount: Number = 0
) -> Number
  (let [
    subtotal (* base-price quantity)
    discounted-price (- subtotal (* subtotal discount))
    tax-amount (* discounted-price tax-rate)
  ]
    (+ discounted-price tax-amount)
  ))

;; Test complex function with named parameters
(print "Total price:" (calculate-total-price 
  base-price: 29.99
  quantity: 2
  discount: 0.15))

;; Function with conditional logic and explicit return
(defn classify-number (num: Number) -> String
  (cond
    (< num 0) (return "negative")
    (= num 0) (return "zero")
    (> num 0) (return "positive")
    true (return "unknown")
  ))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 6: Multi-signature Functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Function with array destructuring
(defn process-point (point: Array)
  (let [
    x (get point 0)
    y (get point 1)
    z (if (>= (js/Array point.length) 3) (get point 2) 0)
  ]
    {
      "x": x,
      "y": y, 
      "z": z,
      "distance": (Math.sqrt (+ (* x x) (* y y) (* z z)))
    }
  ))

;; Function that accepts either an array or named coordinates
(defn plot-point (x: Number y: Number z: Number = 0)
  {
    "coordinates": [x, y, z],
    "formatted": (str "(" x "," y "," z ")")
  })

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SECTION 7: Integration Tests
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Test all the different function forms
(print "Basic addition (5+3):" (add1 5 3))
(print "With return type (5+3):" (add2 5 3))
(print "No type annotations (5+3):" (add3 5 3))
(print "Default parameter (5+0):" (add-with-default 5))
(print "Format name:" (format-name first: "John" last: "Doe"))
(print "Format name with all params:" 
  (format-name first: "Jane" last: "Smith" title: "Dr." suffix: ", PhD"))
(print "Interest calculation:" (calculate-interest principal: 1000 rate: 0.05 years: 3))
(print "Process point array:" (process-point [3, 4]))
(print "Plot point with named params:" (plot-point x: 5 y: 12 z: 3))
(print "Number classification (5):" (classify-number 5))
(print "Complex price calculation:" 
  (calculate-total-price base-price: 100 quantity: 2 tax-rate: 0.07 discount: 0.1))

;; Export for module testing
(export "add1" add1)
(export "add2" add2)
(export "add3" add3)
(export "addWithDefault" add-with-default)
(export "rectangleArea" rectangle-area)
(export "formatName" format-name)
(export "calculateInterest" calculate-interest)
(export "multiply" multiply)
(export "makeAdder" make-adder)
(export "calculateTotalPrice" calculate-total-price)
(export "classifyNumber" classify-number)
(export "processPoint" process-point)
(export "plotPoint" plot-point)