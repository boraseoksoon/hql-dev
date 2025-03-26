;; take-test.hql - Simple test for the take function from stdlib.hql

;; Import the take function from stdlib
(import [take] from "../lib/stdlib/stdlib.hql")

;; Create a test array
(def numbers [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

;; Test the take function
(console.log "Original array:" numbers)
(console.log "First 3 elements:" (take 3 numbers))

;; Test with different values
(console.log "Taking 0 elements:" (take 0 numbers))
(console.log "Taking 5 elements:" (take 5 numbers))
(console.log "Taking more than available:" (take 15 numbers))

(export "result" (take 3 numbers))