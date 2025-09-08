;; examples/take-fixed.hql - Test the range functionality with explicit infinite range

(import [take, range] from "../../core/lib/stdlib/stdlib.hql")

;; Define a helper for infinite range to avoid transpiler warnings
(fn infinite-range ()
  (range 0 Infinity 1))

;; Test with infinite range - this would crash with an eager implementation
(console.log "First 5 elements from infinite range:")
(console.log (take 5 (infinite-range)))

;; Test with various range configurations
(console.log "\nRange with end only:")
(console.log (take 5 (range 10)))

(console.log "\nRange with start and end:")
(console.log (take 5 (range 5 15)))

(console.log "\nRange with start, end, and step:")
(console.log (take 5 (range 0 20 4)))

;; Test negative step
(console.log "\nRange with negative step:")
(console.log (take 5 (range 10 -10 -2)))

;; Test large numbers that would be inefficient with eager evaluation
(console.log "\nFirst 5 numbers after 10000:")
(console.log (take 5 (range 10000 Infinity)))