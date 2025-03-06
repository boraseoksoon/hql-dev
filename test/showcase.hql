;; HQL Complete Showcase
;; This file demonstrates all HQL syntax features with proper syntax

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; IMPORTS & MODULES
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Local module import
(def utils (import "./utils.hql"))

;; Remote module imports (various formats)
(def lodash (import "npm:lodash"))
(def path (import "https://deno.land/std@0.170.0/path/mod.ts"))
(def jsr (import "jsr:@std/path@1.0.8"))
(def chalk (import "https://deno.land/x/chalk_deno@v4.1.1-deno/source/index.js"))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; DATA STRUCTURE LITERALS
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; 1. Object literals - transform to JavaScript objects
(def empty-object {})
(def user {
  "name": "Alice",
  "age": 30,
  "isActive": true,
  "tags": ["developer", "designer"]
})

(def nested-data {
  "users": [
    {"id": 1, "name": "Alice"},
    {"id": 2, "name": "Bob"}
  ],
  "config": {
    "version": "1.0.0",
    "features": {
      "darkMode": true,
      "analytics": false
    }
  }
})

;; 2. Array literals - transform to JavaScript arrays
(def empty-array [])
(def numbers [1, 2, 3, 4, 5])
(def mixed-array [1, "two", true, null, {"key": "value"}])

;; 3. Set literals - transform to JavaScript Sets
(def tags #["javascript", "typescript", "hql"])
(def unique-numbers #[1, 2, 3, 3, 4, 4, 5])  ;; Duplicates removed in Sets

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; FUNCTION DEFINITIONS
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; 1. Basic function definition (defn)
(defn add (x y)
  (+ x y))

;; 2. Anonymous function (fn)
(def multiply (fn (x y)
  (* x y)))

;; 3. Extended function (fx) with type annotations
(fx calculate-area (width: Number height: Number) (-> Number)
  (* width height))

;; 4. Extended function with default parameter value
(fx greet (name: String greeting: String = "Hello") (-> String)
  (str greeting ", " name "!"))

;; 5. Extended function with explicit return
(fx format-user (user: Object) (-> String)
  (let [
    name (get user "name")
    age (get user "age")
  ]
    (return (str name " is " age " years old"))
  ))

;; 6. Extended function with named parameters (calling style)
(fx process-data (data: Array options: Object = {"verbose": false}) -> Object
  (let [
    processed {"result": data, "options": options}
  ]
    processed
  ))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; CONTROL FLOW & VARIABLES
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; 1. Let binding for local variables
(let [
  x 10
  y 20
  z (+ x y)
]
  (print "Sum:" z))

;; 2. If expression (conditional)
(def age 25)
(if (>= age 18)
  (print "Adult")
  (print "Minor"))

;; 3. Cond expression (multi-branch conditional)
(def score 85)
(def grade
  (cond
    (>= score 90) "A"
    (>= score 80) "B"
    (>= score 70) "C"
    (>= score 60) "D"
    true "F"))
(print "Grade:" grade)

;; 4. For loop
;; HQL For Loop Examples
;; This file demonstrates a few simple forms of the pure S‑expression "for" loop in HQL.

;; 1. Basic List Comprehension
;; Iterates over a range and computes the square of each number.
(for ((x (range 5)))
  (* x x))

;; 2. Implicit Binding Form
;; A shorthand version that produces the same result as the basic form.
(for (x (range 5))
  (* x x))

;; 3. Imperative-Style Loop
;; Uses initialization, a condition, and an update expression to mimic a traditional C-style loop.
(for ((i 0) (< i 5) (+ i 1))
  (print "Loop iteration:" i))

;; 4. filter
(for ((x (filter even? (range 10)))) x)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; JAVASCRIPT INTEROP
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; 1. Creating JavaScript objects
(def today (new Date))
(print "Current date:" today)

;; 2. Accessing JavaScript APIs
(print "Random number:" (js/Math.random))
(print "Uppercase:" (js/String "hello".toUpperCase))

;; 3. Using imported JavaScript libraries
(print "Lodash chunk:" (lodash.chunk [1, 2, 3, 4, 5, 6] 2))
(print "Path join:" (path.join "folder" "subfolder" "file.txt"))
(print "Colored text:" (chalk.blue "This text is blue"))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SPECIAL FORMS & ENUMS
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; 1. Define an enum
(defenum TaskStatus PENDING ACTIVE COMPLETED ARCHIVED)

;; 2. Using enum values
(defn get-status-message (status)
  (cond
    (= status TaskStatus.PENDING) "Task is waiting to start"
    (= status TaskStatus.ACTIVE) "Task is in progress"
    (= status TaskStatus.COMPLETED) "Task is finished"
    (= status TaskStatus.ARCHIVED) "Task is archived"
    true "Unknown status"))

;; 3. Set (assignment)
(def counter 0)
(set counter 10)
(print "Counter value:" counter)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; USING FUNCTIONS WITH DIFFERENT CALLING STYLES
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; 1. Regular function call
(print "Regular add:" (add 5 10))

;; 2. Anonymous function call
(print "Anonymous multiply:" (multiply 4 5))

;; 3. Extended function with positional arguments
(print "Area calculation:" (calculate-area 5 10))

;; 4. Extended function with named arguments
(print "Named parameters:" (calculate-area width: 8 height: 6))

;; 5. Extended function with default parameter
(print "Default greeting:" (greet name: "Alice"))
(print "Custom greeting:" (greet name: "Bob" greeting: "Hi"))

;; 6. Complex example with nested function calls
(print "Processed data:" (process-data 
  data: [1, 2, 3, 4, 5] 
  options: {"verbose": true, "maxItems": 3}))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; DEMO OF MACRO EXPANSION (FOR ILLUSTRATION)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; This is how the HQL macros work behind the scenes:

;; 1. Object literal: {"name": "Alice"}
;;    Expands to: (hash-map (keyword "name") "Alice")
;;    Becomes JavaScript: { name: "Alice" }

;; 2. Array literal: [1, 2, 3]
;;    Expands to: (vector 1 2 3)
;;    Becomes JavaScript: [1, 2, 3]

;; 3. Set literal: #[1, 2, 3]
;;    Expands to: (new Set (vector 1 2 3))
;;    Becomes JavaScript: new Set([1, 2, 3])

;; 4. fx form: (fx add (x: Number y: Number) -> Number (+ x y))
;;    Expands to: (defun add (x y) (+ x y))
;;    With type information preserved for transpilation
;;    Becomes JavaScript: function add(x, y) { return x + y; }

;; 5. Named parameter call: (add-typed x: 10 y: 20)
;;    Becomes JavaScript: addTyped({ x: 10, y: 20 })

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; EXPORTS
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(export "add" add)
(export "calculateArea" calculate-area)
(export "greet" greet)
(export "TaskStatus" TaskStatus)
(export "formatUser" format-user)
(export "processData" process-data)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; MAIN EXECUTION
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(print "\n=== HQL Showcase Complete ===\n")
(print "Try using the exported functions in your application!")