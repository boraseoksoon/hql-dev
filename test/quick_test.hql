;; quick_test.hql - Simple example to test enhanced function syntax
;; Save this to a file and run with:
;; deno run -A cli/transpile.ts quick_test.hql && deno run quick_test.js

;; Function with type annotations and default values
(defn greet (name: String title: String = "Mr." age: Number = 30) -> String
  (str "Hello, " title " " name "! You are " age " years old."))

;; Function with conditional logic and explicit returns
(defn calculate (a: Number b: Number operation: String = "add") -> Number
  (cond
    (= operation "add") (return (+ a b))
    (= operation "subtract") (return (- a b))
    (= operation "multiply") (return (* a b))
    (= operation "divide") (if (= b 0) 
                             (return 0) 
                             (return (/ a b)))
    true (return 0)))

;; Function that returns another function
(defn create-formatter (prefix: String = "Value: " suffix: String = "") -> Function
  (fn (value: Any) -> String
    (str prefix value suffix)))

;; Anonymous function with type annotations and default values
(def transform-value (fn (value: Number multiplier: Number = 2 offset: Number = 0) -> Number
  (+ (* value multiplier) offset)))

;; Test the functions with different call patterns
(print "==== Enhanced Function Syntax Quick Test ====\n")

;; Test different ways to call functions with default values and type annotations
(print "Full call:", (greet name: "Smith" title: "Dr." age: 45))
(print "With default title:", (greet name: "Jones" age: 50))
(print "With default age:", (greet name: "Brown" title: "Ms."))
(print "With all defaults:", (greet name: "Johnson"))
(print "Mixed style:", (greet "Taylor" title: "Prof."))

;; Test functions with explicit returns
(print "\nMath operations:")
(print "Addition:", (calculate a: 10 b: 5 operation: "add"))
(print "Subtraction:", (calculate a: 20 b: 8 operation: "subtract"))
(print "Multiplication:", (calculate a: 6 b: 7 operation: "multiply"))
(print "Division:", (calculate a: 100 b: 4 operation: "divide"))
(print "Division by zero:", (calculate a: 50 b: 0 operation: "divide"))
(print "Default operation:", (calculate a: 10 b: 2))

;; Test higher-order functions
(print "\nFunction factories:")
(def number-formatter (create-formatter prefix: "Number: " suffix: "!"))
(def date-formatter (create-formatter prefix: "Date: "))
(print "Formatted number:", (number-formatter 42))
(print "Formatted date:", (date-formatter (js/Date.now)))

;; Test anonymous functions with default parameters
(print "\nTransformations:")
(print "Default transform:", (transform-value 10))  ;; 10 * 2 + 0 = 20
(print "Custom multiplier:", (transform-value 10 multiplier: 3))  ;; 10 * 3 + 0 = 30
(print "Custom offset:", (transform-value 10 offset: 5))  ;; 10 * 2 + 5 = 25
(print "Custom both:", (transform-value 10 multiplier: 3 offset: 5))  ;; 10 * 3 + 5 = 35

;; Test edge cases
(print "\nEdge Cases:")
(defn join-with-defaults (items: Array<String> separator: String = ", " prefix: String = "" suffix: String = "") -> String
  (str prefix (js/Array items.join separator) suffix))

(print "Default join:", (join-with-defaults ["apple", "banana", "orange"]))
(print "Custom separator:", (join-with-defaults ["apple", "banana", "orange"] separator: " | "))
(print "With all options:", (join-with-defaults ["apple", "banana", "orange"] 
                                               separator: " & " 
                                               prefix: "Fruits: [" 
                                               suffix: "]"))

(print "\n==== Test Completed Successfully ====")