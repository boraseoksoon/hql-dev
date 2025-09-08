;; utility.hql - Utility functions for nested imports

;; Simple utility functions (standalone, no stdlib macros required)
(fn multiplyByTwo (x)
  (* x 2))

(fn subtractFive (x)
  (- x 5))

;; Sum first arg and all rest values without relying on reduce/cons macros
(fn addValues (x & rest)
  (var acc x)
  (loop (i 0)
    (if (< i (length rest))
      (do
        (set! acc (+ acc (get rest i)))
        (recur (+ i 1)))
      acc)))

;; Export all functions
(export [multiplyByTwo subtractFive addValues])

(console.log "utility.hql loaded") 
