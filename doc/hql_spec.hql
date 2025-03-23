;; hql_spec.hql - Comprehensive showcase of HQL syntax and features
;; This file demonstrates the "macro everywhere, minimal-core, expression-oriented,
;; single-bundled-output, platform agnostic" philosophy of HQL.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 1. Fundamentals & Data Structures
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Creating JS objects
(def numbers (new Array))
(numbers.push 1)
(numbers.push 2)
(numbers.push 3)
(numbers.push 4)
(numbers.push 5)
(numbers.push 6)
(numbers.push 7)

;; --- Basic Values and Definitions ---
(def pi 3.14159)
(def greeting "Hello, HQL World!")
(def is-awesome true)

;; --- Quote Syntax ---
(def symbol-x 'x)
(def quoted-list '(1 2 3))
(def quoted-expression '(+ 1 (* 2 3)))

;; --- Data Structure Literals ---

[1, 2, 3, 4, 5]     ;; vector
#[1, 2, 3, 4, 5]    ;; set
{ "key" : "value" } ;; map
'(1 2 3 4 5)        ;; list

(def json { items : [1, 2, 3, 4, 5] })

(json.items)

(def data {
  "items": [5, 10, 15, 20, 25, 30, 35, 40],
  "factor": 2,
  "prefix": "Value: "
})

(data.items)

(def empty-vector [])
(def mixed-types ["string", 42, true, nil])
(def nested-vectors [[1, 2], [3, 4]])

(def empty-map {})
(def user {"name": "John", "age": 30})
(def nested-map {"profile": {"id": 1, "settings": {"theme": "dark"}}})

(def empty-set #[])
(def unique-numbers #[1, 2, 3, 4, 5])
(def unique-strings #["apple", "banana", "cherry"])

(def empty-list '())
(def simple-list '(1 2 3 4 5))
(def mixed-list '("hello" 42 true))

;; --- Data Structure Operations ---
(def vec-item (get numbers 2))
(def map-value (get user "name"))
(def first-item (get numbers 0))
(def second-item (get numbers 1))

(def my-vector [1, 2, 3, 4, 5])
(def element2 (get my-vector 2))  
(def element3 (nth my-vector 2))
(def element4 (my-vector 2))

;; look up
(def user2 {"name": "Alice", "status": "active"})
(print (get user2 "name"))  ; returns "Alice"
(print (user2.name))  ; also returns "Alice"
(print (user2["name"]))  ; returns "Alice"

(def my-list (list "a" "b" "c"))
(nth my-list 1)  ;; returns "b"
(print (my-list 1)) ;; b

(def my-vector2 (vector 10 20 30))
(nth my-vector2 2)  ;; returns 30
(print (my-vector2 2)) ;; 30

(def my-set #[1, 2, 3])
(print (my-set 2))  ;; 2
(print (js-call my-set "has" 2))  ;; true

(print (contains? my-set 2))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 2. Functions & Control Flow
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; --- Basic Function Definitions ---
(defn square (x)
  (* x x))

(defn add-three (x y z)
  (+ x (+ y z)))

(defn abs (x)
  (if (< x 0)
      (- 0 x)
      x))

(defn factorial (n)
  (if (<= n 1)
      1
      (* n (factorial (- n 1)))))

(console.log "square : " (square 10))

(export "square" square)

;; --- Expression Sequencing with 'do' ---
(defn calculate-area (radius)
  (do
    (def r-squared (square radius))
    (def area (* pi r-squared))
    area))

(defn complex-calculation (x y)
  (do
    (def sum (+ x y))
    (do
      (def product (* x y))
      (def difference (- x y))
      (list sum product difference))))

;; --- Conditionals and Logic ---
(defn isLargerThan? (a b)
  (if (> a b) a b))

(defn between (x min max)
  (and (>= x min) (<= x max)))

(defn outside (x min max)
  (or (< x min) (> x max)))

(defn not-between (x min max)
  (not (between x min max)))

(defn validate-range (x)
  (cond
    ((and (>= x 0) (< x 10)) "single digit")
    ((and (>= x 10) (< x 100)) "double digit")))

(defn classify-number (x)
  (cond
    ((< x 0) "negative")
    ((= x 0) "zero")
    ((< x 10) "small positive")
    ((< x 100) "medium positive")
    (true "large positive")))

(console.log (classify-number 10))
(console.log (classify-number 100))

;; --- Arithmetic and Comparison Operators ---
(defn arithmetic-demo (a b)
  (list
    (+ a b)  ;; addition
    (- a b)  ;; subtraction
    (* a b)  ;; multiplication
    (/ a b)  ;; division
  ))

(defn comparison-demo (a b)
  (list
    (= a b)   ;; equality
    (!= a b)  ;; inequality
    (< a b)   ;; less than
    (> a b)   ;; greater than
    (<= a b)  ;; less than or equal
    (>= a b)  ;; greater than or equal
  ))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 3. Higher-Order Functions & Rest Parameters
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; --- Higher-Order Functions ---
(defn apply-twice (f x)
  (f (f x)))

(defn make-multiplier (n)
  (fn (x) (* x n)))

(defn demonstration ()
  (do
    (def double (make-multiplier 2))
    (double 10)))  ;; Should return 20

;; --- Rest Parameters ---
(defn log-all (& items)
  (console.log items))

(defn with-prefix (prefix & rest)
  (console.log prefix rest))

;; Example calls
(log-all 1 2 3 4 5)
(with-prefix "Numbers:" 1 2 3)


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 4. Comprehensive Showcase
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

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
(export "showcase" showcase)


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 5. JavaScript Interoperability & Imports
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(numbers.push 8)
(console.log numbers)

;; --- JavaScript Interoperability ---
;; Accessing JS properties with dot notation
(def pi-value (Math.PI))
(def max-int-value (Number.MAX_SAFE_INTEGER))

;; Calling JS methods
(def random-number (Math.random))
(def current-timestamp (Date.now))

;; Console methods
(console.log "Hello from HQL!")
(console.warn "This is a warning")

;; Working with dates
(def date (new Date))
(def current-year (date.getFullYear))
(def month (date.getMonth))
(def formatted-date (date.toLocaleDateString))

;; Math methods
(def abs-value (Math.abs -42))
(def rounded (Math.round 3.7))
(def max-value (Math.max 1 2 3 4 5))

;; (Optional) DOM manipulation (when in browser context)
;; (def element (document.getElementById "myElement"))
;; (element.addEventListener "click" (fn (event) (console.log "Clicked!")))

;; --- Imports ---
(import path "https://deno.land/std@0.170.0/path/mod.ts")
(def joined-path (path.join "folder" "file.txt"))

(import file "https://deno.land/std@0.170.0/fs/mod.ts")
(def exists (file.existsSync "example-dir"))

(import express "npm:express")
(def app (express))                ;; Using default export
(def router (express.Router))      ;; Using named export
(app.use (express.json))           ;; Using named export)


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 6. Advanced Method Chaining & Dot Notation
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; --- Dot Notation Access ---
(def message "Hello, World!")
(def upper-message (message.toUpperCase))
(def message-parts (message.split " "))

(def array [1, 2, 3])
(array.push 4)
(array.push 5)
(console.log array)

;; --- Chained Property Access ---
(def year (date.getFullYear))
(def date-string (date.toISOString))

;; --- Chained Function Calls ---
(def nums [1, 2, 3, 4, 5])
(def filtered (nums.filter (fn (x) (> x 2))))
(def doubled (filtered.map (fn (x) (* x 2))))
(def sum (nums.reduce (fn (a b) (+ a b)) 0))
(def max-sum (Math.max sum 10))

(def config {"db": {"user": {"name": "admin"}}})
(def db-part (config.db))
(def user-part (db-part.user))
(def admin-name (user-part.name))

(defn get-user () {"id": 1, "name": "John"})
(def user-obj (get-user))
(def user-name (user-obj.name))

;; --- Multiple Property Access Patterns ---
(def window-width (window.innerWidth))
(def array-length (array.length))
(def string-upper (message.toUpperCase))
(def substring (message.substring 0 5))
(def replaced (message.replace "Hello" "Hi"))

;; --- Test 4: Basic Method Chaining ---
;; Approach 1: Store intermediate results
(def even-numbers (numbers.filter (fn (n) (= (% n 2) 0))))
(def doubled-evens (even-numbers.map (fn (n) (* n 2))))
(console.log "Doubled evens (step by step):" doubled-evens)

(([1, 2, 3, 4, 5, 6, 7, 8].filter (fn (n) (> n 5))).length)

;; Approach 2: Use do block with temporary variables
(def chained-result 
  (do
    (def filtered (numbers.filter (fn (n) (> n 5))))
    (def mapped (filtered.map (fn (n) (* n 2))))
    (mapped.reduce (fn (acc n) (+ acc n)) 0)))
(console.log "Sum of doubled numbers > 5:" chained-result)

;; Approach 3: Direct method chaining with parentheses
(def direct-chain ((numbers.filter (fn (n) (= (% n 2) 0))).map (fn (n) (* n 2))))
(console.log "Direct chain result:" direct-chain)

;; --- Test 5: Complex Method Chaining ---
(console.log "\n----- Test 5: Complex Method Chaining -----")
(def complex-chain 
  (((numbers.filter (fn (n) (> n 3))).map (fn (n) (* n 3))).slice 0 3))
(console.log "Complex chain result:" complex-chain)

(def sum-chain 
  ((((numbers.filter (fn (n) (> n 5))).map (fn (n) (* n 2)))
     .filter (fn (n) (= (% n 4) 0)))
    .reduce (fn (acc n) (+ acc n)) 0))
(console.log "Sum from complex chain:" sum-chain)


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 7. Daily Macros
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Assume core macros (including when/unless) are already loaded.

;; Define a variable
(def macro_x 10)

;; Use 'when' to log a message if x is greater than 5.
(when (> macro_x 5)
  (js-call console "log" "macro_x is greater than 5"))  ;; x is greater than 5

;; Use 'unless' to log a message if x is not less than 5.
(unless (< macro_x 5)
  (console.log "macro_x is not less than 5")) ;; x is not less than 5

(defn hql-unless (x)
  (unless x
    (not x)))

(export "unless" hql-unless)

;; Use 'inc' to compute x+1.
(def x_plus_one (inc macro_x))

;; Use 'dec' to compute x-1.
(def x_minus_one (dec macro_x))

(console.log x_plus_one)  ;; 11
(console.log x_minus_one) ;; 9

;; Type predicate examples
(def symb 'hello)
(def lst '(1 2 3))
(def mp {"name" : "John"})

;; Sequence operation examples
(def list-numbers '(1 2 3 4 5))

;; Collection manipulation examples
(def xs '(1 2 3))
(def ys '(4 5 6))

;; Collection manipulation examples
(def xs2 '(1 2 3))
(def ys2 '(4 5 6))

;; str

;; Basic string concatenation
(def first-name "John")
(def last-name "Doe")
(def full-name (str first-name " " last-name))
(console.log full-name)  ;; "John Doe"

;; Mixing strings and numbers
(def age 30)
(def bio (str full-name " is " age " years old"))
(console.log bio)  ;; "John Doe is 30 years old"

;; Creating a formatted message
(def score 95)
(def max-score 100)
(def percentage (* (/ score max-score) 100))
(def result-message (str "Score: " score "/" max-score " (" percentage "%)"))
(console.log result-message)  ;; "Score: 95/100 (95%)"

;; Using with other expressions
(def items ["apple", "banana", "orange"])
(def item-count (items.length))
(def summary (str "Found " item-count " items: " (get items 0) ", " (get items 1) ", " (get items 2)))
(console.log summary)  ;; "Found 3 items: apple, banana, orange"

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 8. let
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(let (x 10 y 20 z 30) 
  ((+ x y z)))

(let (x 10)
  (console.log (+ x 5)))

;; Let with multiple bindings
(let (x 10
      y 20)
  (+ x y))

;; Nested let expressions
(let (outer 5)
  (let (inner (+ outer 2))
    (* outer inner)))

;; Let with expressions as binding values
(let (sum (+ 2 3)
      product (* 4 5))
  (list sum product))

;; Using let inside a function definition
(defn calculate (base)
  (let (squared (* base base)
        cubed (* squared base))
    (+ squared cubed)))

(calculate 3)

;; if-let

;;-------------------------------------------------
;; Helper Functions
;;-------------------------------------------------
(defn get-number () 42)
(defn get-nothing () nil)
(defn get-zero () 0)
(defn get-string () "Hello")

;;-------------------------------------------------
;; if-let Tests
;;-------------------------------------------------
;; Test 1: if-let with a truthy number (42)
(defn test-if-let-truthy-number ()
  (if-let (x (get-number))
    (str "Got number: " x)
    "No number"))

;; Test 2: if-let with a nil value
(defn test-if-let-nil ()
  (if-let (x (get-nothing))
    (str "Got something: " x)
    "Got nothing"))

;; Test 3: if-let with zero (0 is falsy in JS/HQL)
(defn test-if-let-zero ()
  (if-let (x (get-zero))
    (str "Got zero: " x)
    "Zero is considered falsy"))

;; Test 4: if-let with a non-empty string (truthy)
(defn test-if-let-string ()
  (if-let (x (get-string))
    (str "Got string: " x)
    "No string"))

;; Test 5: Nested if-let:
;; First binding x from get-number; then, if x > 40, bind y from get-string.
(defn test-if-let-nested ()
  (if-let (x (get-number))
    (if-let (y (if (> x 40) (get-string) nil))
      (str "Nested test: x = " x ", y = " y)
      (str "Nested test: x = " x ", no y"))
    "No number"))

;;-------------------------------------------------
;; Run Tests: Console Output
;;-------------------------------------------------
(console.log (test-if-let-truthy-number))  ;; Expected: "Got number: 42"
(console.log (test-if-let-nil))            ;; Expected: "Got nothing"
(console.log (test-if-let-zero))           ;; Expected: "Zero is considered falsy"
(console.log (test-if-let-string))         ;; Expected: "Got string: Hello"
(console.log (test-if-let-nested))         ;; Expected: "Nested test: x = 42, y = Hello"