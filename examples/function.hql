;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Pure functions using fx (commented out for now)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; (fx add (a b)
;;   (+ a b))
;; (fx subtract (a b)
;;   (- a b))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Impure functions using fn
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(fn impureAdd (a b)
  (print "Calculating impure add:" a b)
  (+ a b))

(fn impureSubtract (a b)
  (print "Calculating impure subtract:" a b)
  (- a b))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Testing lambdas (anonymous functions)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(print "Testing lambda add:" ((lambda (a b) (+ a b)) 3 4))
(print "Testing lambda subtract:" ((lambda (a b) (- a b)) 7 2))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Testing impure functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
(print "Testing impure fn add:" (impureAdd 3 4))
(print "Testing impure fn subtract:" (impureSubtract 7 2))
