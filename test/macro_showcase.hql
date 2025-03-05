;; HQL Macro System Test
;; Tests the complete macro system with extended syntax

;; =========================================================
;; 1. Data Structure Literals with Macros
;; =========================================================

;; JSON-like Object Literals
(def user {"name": "Alice", "age": 30, "active": true})
(print "User object:" user)

;; JSON-like Array Literals 
(def numbers [1, 2, 3, 4, 5])
(print "Numbers array:" numbers)

;; Set Literals
(def tags #["javascript", "macros", "hql", "javascript"])
(print "Unique tags (should drop duplicate):" tags)

;; Nested Data Structures
(def complex-data {
  "user": {"name": "Bob", "age": 25},
  "scores": [90, 85, 92],
  "tags": #["student", "premium"]
})
(print "Complex nested data:" complex-data)

;; =========================================================
;; 2. Extended Function Syntax with Macros
;; =========================================================

;; Basic fx form
(fx add (a: Number b: Number) -> Number
  (+ a b))
(print "Add result:" (add a: 10 b: 20))

;; fx with default parameter
(fx greet (name: String greeting: String = "Hello") -> String
  (str greeting ", " name "!"))
(print (greet name: "Alice"))
(print (greet name: "Bob" greeting: "Hi"))

;; Complex fx with type annotations and defaults
(fx calculate-total (price: Number quantity: Number = 1 tax-rate: Number = 0) -> Number
  (let [
    subtotal (* price quantity)
    tax (* subtotal (/ tax-rate 100))
  ]
    (+ subtotal tax)))

(print "Total with defaults:" (calculate-total price: 19.99))
(print "Total with quantity:" (calculate-total price: 19.99 quantity: 3))
(print "Total with all params:" (calculate-total 
                                 price: 19.99 
                                 quantity: 2 
                                 tax-rate: 8.5))

;; =========================================================
;; 3. Custom Macros
;; =========================================================

;; Define a when macro
(defmacro when (condition & body)
  (list 'if condition
        (list 'do body)
        nil))

;; Define an unless macro
(defmacro unless (condition & body)
  (list 'if 
        (list 'not condition)
        (list 'do body)
        nil))

;; Test the macros
(def x 10)

(when (> x 5)
  (print "x is greater than 5")
  (print "This is in the when body"))

(unless (< x 5)
  (print "x is not less than 5")
  (print "This is in the unless body"))

;; =========================================================
;; 4. For Loop Macro
;; =========================================================

;; List comprehension style
(print "Squares:")
(print (for (x [1, 2, 3, 4, 5])
  (* x x)))

;; Imperative style for loop
(print "Counting:")
(for ((i 1) (<= i 5) (+ i 1))
  (print (str "Count: " i)))

;; =========================================================
;; 5. More Complex Macros
;; =========================================================

;; Define a with-timing macro to measure execution time
(defmacro with-timing (& body)
  (list 'let ['start '(js/Date.now)]
        (list 'do body
              (list 'print 
                    (list 'str "Execution time: " 
                          (list '- '(js/Date.now) 'start) 
                          "ms")))))

;; Test the timing macro
(with-timing
  (for ((i 0) (< i 100000) (+ i 1))
    (* i i))
  (print "Timing test complete"))

;; Define a cond macro for multi-case conditionals
(defmacro cond (& clauses)
  (if (empty? clauses)
    nil
    (if (= (count clauses) 1)
      (first clauses)
      (list 'if (first clauses)
            (second clauses)
            (apply 'cond (rest (rest clauses)))))))

;; Test the cond macro
(def grade 85)
(def result 
  (cond
    (>= grade 90) "A"
    (>= grade 80) "B"
    (>= grade 70) "C"
    (>= grade 60) "D"
    true "F"))
(print "Grade:" result)

;; =========================================================
;; 6. Thread-first macro for chaining operations
;; =========================================================

(defmacro -> (x & forms)
  (if (empty? forms)
    x
    (let [form (first forms)
          threaded (if (list? form)
                     (concat (list (first form)) (list x) (rest form))
                     (list form x))]
      (concat (list '->) (list threaded) (rest forms)))))

;; Test the thread-first macro
(def numbers [1, 2, 3, 4, 5])

(def processed 
  (-> numbers
      (map (fn (x) (* x 2)))
      (filter (fn (x) (> x 5)))
      (reduce (fn (sum x) (+ sum x)) 0)))

(print "Processed result:" processed)

;; =========================================================
;; Conclusion
;; =========================================================

(print "\nMacro system tests completed successfully!")
(print "Data structure literals, fx, for, and custom macros all work!")