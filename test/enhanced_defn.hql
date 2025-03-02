;; test/enhanced_defn.hql
;; Test file for enhanced function definitions in HQL

;; ---------- Basic Functions with Type Annotations ----------

;; Case 1: Implicit return type, explicit parameter types, no defaults
(defn add1 (x: Int y: Int)
  (+ x y))

;; Case 2: Explicit return type, explicit parameter types, no defaults
(defn add2 (x: Int y: Int) -> Int
  (+ x y))

;; Case 3: All types inferred (parameters and return), no defaults
(defn add3 (x y)
  (+ x y))

;; ---------- Functions with Default Parameter Values ----------

;; Case 4: Implicit return type, explicit parameter types with default value
(defn add4 (x: Int y: Int = 0)
  (+ x y))

;; Case 5: Explicit return type, explicit parameter types with default value
(defn add5 (x: Int y: Int = 0) -> Int
  (+ x y))

;; Case 6: Implicit return type, inferred parameter types with default value
(defn add6 (x y = 0)
  (+ x y))

;; Case 7: Explicit return type, inferred parameter types with default value
(defn add7 (x y = 0) -> Int
  (+ x y))

;; ---------- Functions with Explicit Return Statement ----------

;; Case 8: Implicit return type, explicit parameter types, no defaults, explicit return
(defn add8 (x: Int y: Int)
  (return (+ x y)))

;; Case 9: Explicit return type, explicit parameter types, no defaults, explicit return
(defn add9 (x: Int y: Int) -> Int
  (return (+ x y)))

;; ---------- Complex Function Examples ----------

;; Multiple parameters with mixed types, defaults, and explicit return type
(defn calculate-area (width: Number height: Number unit: String = "cm") -> Number
  (let [
    area (* width height)
  ]
    (cond
      (= unit "m") (* area 10000)  ; Convert from m² to cm²
      (= unit "mm") (/ area 100)   ; Convert from mm² to cm²
      true area                    ; Default unit is cm²
    )
  ))

;; Function with multiple parameters and defaults
(defn format-user (first-name: String last-name: String age: Number = 30 title: String = "Mr.") -> String
  (str title " " first-name " " last-name ", Age: " age))

;; Anonymous function (fn) with type annotations and defaults
(def multiply-and-add 
  (fn (x: Number y: Number factor: Number = 1) -> Number
    (+ (* x y) factor)))

;; ---------- Test Function Calls ----------

;; Basic usage without defaults
(print "add1(5, 10):" (add1 5 10))
(print "add2(5, 10):" (add2 5 10))
(print "add3(5, 10):" (add3 5 10))

;; Using default parameters
(print "add4(5):" (add4 5))
(print "add5(5):" (add5 5))
(print "add6(5):" (add6 5))
(print "add7(5):" (add7 5))

;; Function with explicit return
(print "add8(5, 10):" (add8 5 10))
(print "add9(5, 10):" (add9 5 10))

;; Complex function examples
(print "calculate-area(10, 20):" (calculate-area 10 20))
(print "calculate-area(10, 20, \"m\"):" (calculate-area 10 20 "m"))

;; Using named parameters
(print "calculate-area with named params:" 
  (calculate-area width: 10 height: 20 unit: "m"))

(print "format-user with defaults:" 
  (format-user first-name: "John" last-name: "Doe"))

(print "format-user with all params:" 
  (format-user first-name: "Jane" last-name: "Smith" age: 25 title: "Dr."))

(print "Anonymous function call:"
  (multiply-and-add 5 10))

(print "Anonymous function with named params:"
  (multiply-and-add x: 5 y: 10 factor: 20))

;; ---------- Test Function Returns ----------

;; Test default values with different types
(defn test-defaults (name: String count: Number = 1 enabled: Boolean = true) -> Object
  {
    "name": name,
    "count": count,
    "enabled": enabled,
    "message": (str "Processing " count " items for " name)
  })

(print "test-defaults with only required param:" (test-defaults "test"))
(print "test-defaults with all params:" (test-defaults "test" 5 false))
(print "test-defaults with named params:" (test-defaults name: "test" enabled: false count: 10))

;; ---------- End of Tests ----------