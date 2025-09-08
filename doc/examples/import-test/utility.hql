;; utility.hql - Utility functions for nested imports

;; Simple utility functions
(fn multiplyByTwo (x)
  (* x 2))

(fn subtractFive (x)
  (- x 5))

(fn addValues (x & rest)
  (reduce (cons x rest) (lambda (acc v) (+ acc v)) 0))

;; Export all functions
(export [multiplyByTwo subtractFive addValues])

(console.log "utility.hql loaded") 