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

;; ========== Expression Sequencing with 'do' ==========

;; The 'do' form allows executing multiple expressions in sequence,
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
(defn isLargerThan? (a b)
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

;; ========== Quote Syntax ==========

;; Quote a symbol or expression to prevent evaluation
(def symbol-x 'x)
(def quoted-list '(1 2 3))
(def quoted-expression '(+ 1 (* 2 3)))

;; ========== JavaScript Interoperability ==========

;; Accessing JavaScript properties with dot notation
(def pi-value Math.PI)
(def max-int-value Number.MAX_SAFE_INTEGER)

;; Calling JavaScript methods with dot notation
(def random-number (Math.random))
(def current-timestamp (Date.now))

;; Using console methods
(console.log "Hello from HQL!")
(console.warn "This is a warning")

;; String methods
(def message "hello world")
(def upper-text (message.toUpperCase))
(console.log upper-text)

;; Creating JavaScript objects
(def numbers (new Array))
(numbers.push 1)
(numbers.push 2)
(numbers.push 3)
(console.log numbers)

;; Working with dates
(def date (new Date))
(def current-year (date.getFullYear))
(def month (date.getMonth))
(def formatted-date (date.toLocaleDateString))

;; Math methods
(def abs-value (Math.abs -42))
(def rounded (Math.round 3.7))
(def max-value (Math.max 1 2 3 4 5))

;; DOM manipulation (when in browser context)
;; (def element (document.getElementById "myElement"))
;; (element.addEventListener "click" (fn (event) (console.log "Clicked!")))

;; ========== Imports and Exports ==========

;; Import a module
(import "https://deno.land/std@0.170.0/path/mod.ts")

;; Define and export a function
(defn join-paths (a b)
  (mod.join a b))

;; Export the function
(export "joinPaths" join-paths)

;; Export a value
(export "PI" pi)

;; ========== Higher-Order Functions ==========

;; Function that takes a function as an argument
(defn apply-twice (f x)
  (f (f x)))

;; Function that returns a function
(defn make-multiplier (n)
  (fn (x) (* x n)))

;; Using a higher-order function
(defn demonstration ()
  (do
    (def double (make-multiplier 2))
    (double 10)))  ;; Should return 20

;; ========== Rest Parameters ==========

;; Function with rest parameters
(defn log-all (& items)
  (console.log items))

;; Function with regular and rest parameters
(defn with-prefix (prefix & rest)
  (console.log prefix rest))

;; Examples of calling functions with rest parameters
(log-all 1 2 3 4 5)
(with-prefix "Numbers:" 1 2 3)

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
          (console.log msg)
          (list n fact)))))

;; Export the showcase function
(export "showcase" showcase)