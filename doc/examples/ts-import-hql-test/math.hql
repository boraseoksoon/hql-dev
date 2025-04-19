;; HQL file that will be imported by TypeScript
;; This demonstrates basic math operations and string functions

;; Import TypeScript function to demonstrate circular imports
(import [operateAndGreet] from "./main.ts")

;; Import JavaScript function
(import [jsFormatter] from "./js-importer.js")

;; Basic math functions
(fn add (a b)
  (+ a b))

(fn multiply (a b)
  (* a b))

;; String greeting function
(fn greet (name)
  (+ "Hello, " name "!"))

;; Function using the JS import
(fn formatGreeting (name)
  (jsFormatter (greet name)))

;; Test the circular import
(fn testTsCircularImport (name)
  (console.log "Testing circular import from HQL to TS and back:")
  (console.log (operateAndGreet name 10 20)))

;; Test the JS circular import
(fn testJsCircularImport (name)
  (console.log "Testing circular import from HQL to JS and back:")
  (console.log (formatGreeting name)))

;; Export functions
(export [add multiply greet formatGreeting testTsCircularImport testJsCircularImport])

;; Self-test of functions
(console.log "Add result (internal):" (add 5 7))
(console.log "Multiply result (internal):" (multiply 6 8))
(console.log "Greeting (internal):" (greet "World"))

;; Test circular imports
(testTsCircularImport "Circular Import")
(testJsCircularImport "JS Circular") 