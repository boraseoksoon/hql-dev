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