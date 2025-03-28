
(fx add (x: Int = 100 y: Int = 200) (-> Int) 
  (+ x y))

;; Using defaults (omitting parameters)
(print (add))   ;; 300

;; Using named parameters
(print (add x: 99)) ;; 299
(print (add y: 99)) ;; 199
(print (add x: 1 y: 2)) ;; 3

;; Using positional parameters
(print (add 1 2))   ;; 3
