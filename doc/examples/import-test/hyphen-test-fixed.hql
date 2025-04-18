;; hyphen-test-fixed.hql - Fixed test for imported functions
(import [multiply_by_five, add_ten] from "./hyphen-functions.hql")

;; Define wrapper functions to use the imported functions
(fn apply_multiply (x)
  (multiply_by_five x))

(fn apply_add (x)
  (add_ten x))

;; Call the wrapper functions
(let result1 (apply_multiply 6))
(let result2 (apply_add 7))

(console.log "Underscore identifiers test (fixed)")
(console.log "multiply_by_five(6):" result1)
(console.log "add_ten(7):" result2) 