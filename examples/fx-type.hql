;; currently implement 1: : (fx add ((x: Int = 100 y: Int = 200) -> Int) (+ x y))
;; (fx add (x: Int = 100 y: Int = 200) -> Int (+ x y))

;; let's update fx syntax to accpet this only
;; (fx add (x: Int = 100 y: Int = 200) (-> Int) (+ x y))

/*
;; same but newline added
(fx add (x: Int = 100 y: Int = 200) ; Parameter list
        (-> Int)                    ; Return type list
  (+ x y))
*/


;; Using defaults (omitting parameters)
(print (add))   ;; 300

;; Using named parameters
(print (add x: 99)) ;; 299
(print (add y: 99)) ;; 199
(print (add x: 1 y: 2)) ;; 3

;; Using positional parameters
(print (add 1 2))   ;; 3