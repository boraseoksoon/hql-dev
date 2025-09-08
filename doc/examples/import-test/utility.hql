;; utility.hql - Utility functions for nested imports

;; Simple utility functions
(fn multiplyByTwo (x)
  (* x 2))

(fn subtractFive (x)
  (- x 5))

(fn addValues (& args)
  (reduce args (fn (acc x) (+ acc x)) 0))

;; Export all functions
(export [multiplyByTwo subtractFive addValues])

(console.log "utility.hql loaded") 