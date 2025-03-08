;; hql_spec.hql - Comprehensive showcase of HQL syntax and features
;; This file demonstrates the "macro everywhere, minimal-core, expression-oriented, 
;; single-bundled-output, platform agnostic" philosophy of HQL.

;; ========== Basic Values and Definitions ==========

;; Define a simple constant
(def pi 3.14159)

;; Define a string constant
(def greeting "Hello, HQL World!")

;; Define a boolean constant
(def is-awesome true)

;; ========== Function Definition and Application ==========

;; Define a simple function with one parameter
(defn square (x)
  (* x x))

;; Function with multiple parameters
(defn add-three (x y z)
  (+ x (+ y z)))

;; Function with a conditional
(defn abs (x)
  (if (< x 0)
      (- 0 x)
      x))

;; Recursive function
(defn factorial (n)
  (if (<= n 1)
      1
      (* n (factorial (- n 1)))))

;; ========== Expression Sequencing with 'do' Macro ==========

;; The 'do' macro allows executing multiple expressions in sequence,
;; returning the value of the last expression
(defn calculate-area (radius)
  (do
    (def r-squared (square radius))
    (def area (* pi r-squared))
    area))

;; Nested 'do' expressions
(defn complex-calculation (x y)
  (do
    (def sum (+ x y))
    (do
      (def product (* x y))
      (def difference (- x y))
      (list sum product difference))))

;; ========== Conditionals and Logic ==========

;; Simple conditional using 'if'
(defn max-value (a b)
  (if (> a b) a b))

;; Using 'cond' for multi-way conditionals
(defn classify-number (n)
  (cond
    ((< n 0) "negative")
    ((= n 0) "zero")))

;; Using 'and' for logical conjunction
(defn between (x min max)
  (and (>= x min) (<= x max)))

;; Using 'or' for logical disjunction
(defn outside (x min max)
  (or (< x min) (> x max)))

;; Using 'not' for logical negation
(defn not-between (x min max)
  (not (between x min max)))

;; Complex logical expression
(defn validate-range (x)
  (cond
    ((and (>= x 0) (< x 10)) "single digit")
    ((and (>= x 10) (< x 100)) "double digit")))

;; ========== Arithmetic and Comparison Operators ==========

;; Basic arithmetic
(defn arithmetic-demo (a b)
  (list
    (+ a b)  ;; addition
    (- a b)  ;; subtraction
    (* a b)  ;; multiplication
    (/ a b)  ;; division
  ))

;; Comparison operators
(defn comparison-demo (a b)
  (list
    (= a b)  ;; equality
    (!= a b) ;; inequality
    (< a b)  ;; less than
    (> a b)  ;; greater than
    (<= a b) ;; less than or equal
    (>= a b) ;; greater than or equal
  ))

;; ========== JavaScript Interoperability ==========

;; Access JavaScript console
(defn log-message (msg)
  (js-call console "log" msg))

;; Create a JavaScript Date object
(defn current-time ()
  (js-new Date (list)))

;; Access JavaScript Math properties
(defn random-number ()
  (js-get Math "random"))

;; ========== Imports and Exports ==========

;; Import a standard library module
(import "https://deno.land/std@0.170.0/path/mod.ts")

;; Define and export a function
(defn join-paths (a b)
  (mod.join a b))

;; Export the function with a specific name
(export "joinPaths" join-paths)

;; Export a simple value
(export "PI" pi)

;; ========== Higher-Order Functions ==========

;; Function that takes a function as an argument
(defn apply-twice (f x)
  (f (f x)))

;; Function that returns a function
(defn make-adder (n)
  (fn (x) (+ x n)))

;; Using a higher-order function
(defn demonstration ()
  (do
    (def add-five (make-adder 5))
    (add-five 10)))  ;; Should return 15

;; ========== Nested Expressions ==========

;; This demonstrates the expression-oriented nature of HQL
;; where everything is an expression that yields a value
(defn nested-expression-demo (x)
  (+ (* 2 (square (+ x 1)))
     (if (> x 0)
         (factorial x)
         0)))

;; ========== Putting It All Together ==========

;; A comprehensive function that uses multiple features
(defn showcase (n)
  (do
    (def result
      (cond
        ((< n 0) "Cannot compute for negative numbers")
        ((= n 0) "Identity element for factorial")))
    
    (if result
        result
        (do
          (def fact (factorial n))
          (def msg (+ "Factorial of " (+ n " is " fact)))
          (log-message msg)
          (list n fact)))))


;; Function with rest parameters
(defn log-all (& items)
  (js-call console "log" items))

;; Function with regular and rest parameters
(defn with-prefix (prefix & rest)
  (js-call console "log" prefix rest))

(def a 10)

(log-all a (+ a a))

;; do macro

(def result6
  (do
    (def p 100)
    (def q 200)
    (def r 300)
    (def s 400)
    (+ p q r s)))

;; JS interop - doc access

;; Basic property access
(def pi-value Math.PI)

(console.log pi-value)
(console.log (pi-value))

;; No-parameter method call with runtime type checking
(def random-number (Math.random))

;; Method call with arguments
(def text "hello world")
(def upper-text (text.toUpperCase))
(console.log upper-text)

;; Create an array and manipulate it
(def numbers (new Array))
(numbers.push 1)
(numbers.push 2)
(numbers.push 3)
(console.log numbers)

;; Date methods
(def date (new Date))
(def current-year (date.getFullYear))

;; Export the values so they can be accessed
(export "pi" pi-value)
(export "random" random-number)
(export "upperText" upper-text)
(export "numbers" numbers)
(export "year" current-year)

;; Export the showcase function
(export "showcase" showcase)