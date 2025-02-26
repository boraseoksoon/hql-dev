;; simple.hql
;;
;; This file combines the examples from simple.hql and hello.hql.
;; It has been sanitized to remove duplication and to follow a consistent S-expression style.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Section 1: Module Imports
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Local module (if needed)
(def mod (import "./simple2.hql"))

;; Remote modules
;; it is not build by dnt for weird and cryptic reasons (def strUtil (import "https://esm.sh/lodash"))
(def strUtil (import "npm:lodash"))
(def chalk (import "https://deno.land/x/chalk_deno@v4.1.1-deno/source/index.js"))
(def chalk2 (import "jsr:@nothing628/chalk"))
(def lodash (import "npm:lodash"))

;; Standard library modules (Deno)
(def pathModule (import "https://deno.land/std@0.170.0/path/mod.ts"))
(def datetime (import "https://deno.land/std@0.170.0/datetime/mod.ts"))
(def uuidModule (import "https://deno.land/std@0.170.0/uuid/mod.ts"))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Section 2: Function Definitions & Data Structures
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Part 1: Local module usage and greetings
(defn greet (name)
  (str (mod.sayHi name) " Welcome to HQL.")
)
;; For testing, call greet and print its result.
(print (greet "Alice"))

;; Part 2: Remote-based definitions (using lodash)
(defn greetRemote (name)
  (str (strUtil.upperCase "Hello, ") name "!")
)
(defn greetTwice (name)
  (str (greetRemote name) " " (greetRemote name))
)
(print (greetRemote "jss"))

;; Part 3: JS modules and interop examples
(print ((get chalk "blue") "hello hql!"))
(print ((get chalk2 "red") "hello hql?"))
(print ((get lodash "chunk") (list 1 2 3 4 5 6) 2))

;; Part 4: Import a JS module that itself imports an HQL module.
;; (Assumes that interop.js is a valid JS module exporting a function sayHello.)
;; (def simple (import "./interop.js"))
;; (print simple.sayHello)

;; Data Structures: using JS arrays and objects
(print "====== Data Structures ======")
;; A vector is just a JavaScript array.
(def myvec (vector 10 20 30 40))
(print myvec)
;; A hash-map is converted to a JS object.
(def mymap (hash-map (keyword "a") 100 (keyword "b") 200))
(print mymap)
;; Create a Set from a list.
(def myset (new Set (list 1 2 3)))
(print (get myset "size"))

;; Standard Library Demo
(print "====== Standard Library Demo ======")
(def join (get pathModule "join"))
(print (join "foo" "bar" "baz.txt"))
(def format (get datetime "format"))
(print (format (new Date) "yyyy-MM-dd HH:mm:ss"))
(def generate (get uuidModule "v4"))
(print generate)

;; Special forms and arithmetic
(print "====== New Special Form Test ======")
(def arr (new Array 1 2 3))
(print arr)
(print "====== Arithmetic Operations ======")
(def add (fn (a b) (+ a b)))
(print (add 3 4))
(def inc (fn (n) (+ n 1)))
(print (inc 10))

;; Function definition demos using defn
(print "====== New Syntax (defn) Demo ======")
(defn addN (x y)
  (+ x y))
(print (addN 2 3))
(defn minus (x: Number y: Number) (-> Number)
  (- x y))
(print (minus x: 100 y: 20))

;; Sync/Async Exports & enums
(print "====== Sync/Async Exports ======")
(def syncAdd (fn (x: Number y: Number) (-> Number) (+ x y)))
(def syncMinus (fn (x: Number y: Number) (-> Number) (- x y)))
(export "syncAdd" syncAdd)
(export "syncMinus" syncMinus)
(def add2 (fn (x y) (+ x y)))
(def minus2 (fn (x y) (- x y)))
(export "add2" add2)
(export "minus2" minus2)
(defenum Destination hlvm macos ios)
(defn send (message: String to: Destination) message)
(defn send2 (message: String to: Destination) (-> Void) message)
(print (send message: "hello1" to: .hlvm))
(print (send2 message: "hello2" to: Destination.hlvm))

;; String Interpolation Demo (not yet implemented)
(print "====== String Interpolation Demo ======")
(def name "Charlie")
(def greeting "hello my name is \\(name) and welcome!")
(print greeting)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Section 3: Module Exports
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(export "greet" greet)
(export "greetTwice" greetTwice)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Section 4: Named Parameter Tests (APPENDED)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(print "====== Named Parameter Tests ======")

;; Test 1: Basic named parameter usage
(defn calculate-area (width: Number height: Number) (-> Number)
  (* width height))
(print "Area of 5x10 rectangle: " (calculate-area width: 5 height: 10))

;; Test 2: Named parameters with default arguments
(defn format-name (first: String last: String title: String)
  (str title " " first " " last))
(print "Formatted name: " (format-name first: "Jane" last: "Doe" title: "Dr."))

;; Test 3: Mixed positional and named arguments (for functions that support it)
(defn point3d (x y z)
  (vector x y z))
(print "3D Point: " (point3d 10 20 30))

;; Test 4: Function composition with named parameters
(defn apply-tax (amount: Number rate: Number) (-> Number)
  (* amount (+ 1 (/ rate 100))))
(defn calculate-total (price: Number qty: Number tax-rate: Number) (-> Number)
  (apply-tax amount: (* price qty) rate: tax-rate))
(print "Total price with tax: " (calculate-total price: 19.99 qty: 3 tax-rate: 8.5))

;; Test 5: Higher-order functions with named parameters
(defn make-adder (increment: Number) (-> (-> Number Number))
  (fn (x) (+ x increment)))
(def add5 (make-adder increment: 5))
(print "Result of add5(10): " (add5 10))

;; Test 6: Multi-operation arithmetic with different operators
(defn complex-math (a: Number b: Number c: Number) (-> Number)
  (+ (* a b) (/ c (+ a b))))
(print "Complex math result: " (complex-math a: 5 b: 3 c: 30))

;; Test 7: More complex nested call with named parameters
(defn process-data (data: Number options: Object) (-> Number)
  (* data (get options "factor")))
(print "Processed data: " (process-data data: 100 options: (hash-map (keyword "factor") 1.5)))

;; Export test functions
(export "calculateArea" calculate-area)
(export "formatName" format-name)
(export "calculateTotal" calculate-total)
(export "complexMath" complex-math)
(export "processData" process-data)