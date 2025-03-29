(1) i :  0
(1) i :  1
(1) i :  3

(for (i 3)         ; iterate i from 0 to 3
  (print "(1) i : " i))

;; (2) i :  5
;; (2) i :  6
;; (2) i :  7
;; (2) i :  8
;; (2) i :  9

(for (i 5 10)       ; iterate i from 5 to 9
  (print "(2) i : " i))

;; (3) i :  0
;; (3) i :  2
;; (3) i :  4
;; (3) i :  6
;; (3) i :  8

(for (i 0 10 2)     ; iterate i from 0 to 9 by steps of 2
  (print "(3) i : " i))