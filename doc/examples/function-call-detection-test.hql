;; Function Call Detection Test
;; This file demonstrates the improved detection of function calls versus collection access

;; ===== Basic Functions =====
(fn add5 (x)
  (+ x 5))

(fn doSomethingFn (x)
  (+ x 10))

(fn getElementAtIndex (arr index fallback)
  (if (< index (js/Array.isArray arr))
    (get arr index)
    fallback))

;; ===== Collections =====
(var myArray ["a" "b" "c"])
(var myObj (hash-map "x" 1 "y" 2 "z" 3))

;; ===== Edge Cases =====
;; Functions with names that don't follow typical function naming patterns
(fn xyz (n)
  (* n 2))

;; Functions that take functions as arguments
(fn applyTwice (f x)
  (f (f x)))

;; Create a simple adder function
(fn add10 (x)
  (+ x 10))

;; ===== Tests =====
(console.log "===== Basic Function Tests =====")
(console.log "add5(10):" (add5 10))
(console.log "doSomethingFn(5):" (doSomethingFn 5))
(console.log "getElementAtIndex(myArray, 1, 'not found'):" (getElementAtIndex myArray 1 "not found"))

(console.log "===== Collection Access Tests =====")
(console.log "get(myArray, 0):" (get myArray 0))
(console.log "get(myObj, 'x'):" (get myObj "x"))

(console.log "===== Edge Case Tests =====")
(console.log "xyz(5):" (xyz 5))
(console.log "applyTwice(add5, 10):" (applyTwice add5 10))
(console.log "add10(5):" (add10 5))

;; ===== Functions with multiple arguments =====
(fn sumThree (a b c)
  (+ a (+ b c)))

(console.log "sumThree(1, 2, 3):" (sumThree 1 2 3))

;; Previous issue test - collection access that was mistaken for function call
(var collectionTest ["alpha" "beta" "gamma"])
(console.log "Access element safely:")
(console.log "getElementAtIndex(collectionTest, 1, 'fallback'):" (getElementAtIndex collectionTest 1 "fallback"))
(console.log "getElementAtIndex(collectionTest, 5, 'fallback'):" (getElementAtIndex collectionTest 5 "fallback")) 