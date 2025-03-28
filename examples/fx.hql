(print "============ fx test =============")

(fx multiply (x: Int = 10 y: Int = 20) (-> Int)
  (* x y))

;; 1. Using defaults:
(print (multiply))                   ;; Uses both defaults: 10 * 20 = 200

;; 2. Positional arguments:
(print (multiply 5))                 ;; Overrides x: 5 * 20 = 100
(print (multiply 5 7))               ;; Overrides both: 5 * 7 = 35

;; 3. Named arguments:
(print (multiply x: 5))              ;; x overridden: 5 * 20 = 100
(print (multiply y: 15))             ;; y overridden: 10 * 15 = 150
(print (multiply x: 5 y: 7))         ;; Both overridden: 5 * 7 = 35

;; 5. Using a placeholder (if supported) to skip parameters:
(print (multiply _ 7))              ;; Explicitly skip x: x remains 10, y becomes 7 → 10 * 7 = 70

;; Not allowed (ambiguous):
;; (print (multiply 5 y: 7))         ;; Mixing positional (5) with named (y: 7)
;; (print (multiply x: 5 7))         ;; Mixing named (x: 5) with positional (7)