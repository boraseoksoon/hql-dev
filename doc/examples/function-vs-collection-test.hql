;; Test function calls versus collection access
;; This is a simplified test to demonstrate that the transpiler correctly
;; distinguishes between function calls and collection access operations

;; Define a function
(fn myFunction (x)
  (+ x 10))

;; Another function that uses the first one
(fn getValueFromFunction (x)
  (myFunction x))

;; Create an array and object to test different types of collection access
(var myArray ["apple" "banana" "cherry"])
(var myMap (hash-map "a" "apple" "b" "banana" "c" "cherry"))

;; Create a function that uses 'get' function
(fn getElement (collection key)
  (get collection key))

;; Tests for function calls
(console.log "===== Function call tests =====")
(console.log "Result of myFunction(5):" (myFunction 5))
(console.log "Result of getValueFromFunction(5):" (getValueFromFunction 5))

;; Tests for array access
(console.log "===== Array access tests =====")
(console.log "Element 0 from array:" (get myArray 0))
(console.log "Element 1 from array:" (get myArray 1))
(console.log "Element 2 from array:" (get myArray 2))

;; Tests for map access
(console.log "===== Map access tests =====")
(console.log "Property 'a' from map:" (get myMap "a"))
(console.log "Property 'b' from map:" (get myMap "b"))
(console.log "Property 'c' from map:" (get myMap "c"))

;; Test function that accesses collections
(console.log "===== Mixed case tests =====")
(console.log "Array access through function:" (getElement myArray 2))
(console.log "Map access through function:" (getElement myMap "c"))

;; Test multiple arguments to ensure it's a function call
(console.log "===== Multiple argument function call =====")
(fn multiArgFunction (a b c)
  (+ a (* b c)))
(console.log "Result of multiArgFunction(1, 2, 3):" (multiArgFunction 1 2 3))

;; Edge case: what happens if we pass a function to another function
(console.log "===== Function as argument test =====")
(fn applyFunction (f x)
  (f x))
(console.log "Result of applyFunction(myFunction, 5):" (applyFunction myFunction 5)) 