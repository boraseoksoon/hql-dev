;; Style 2: Wrapped signature
(fx add ((x: Int = 100 y: Int = 200) -> Int)
  (+ x y))


;; Using defaults (omitting parameters)
(add)

;; Using named parameters
(add x: 99)
(add y: 99)
(add x: 1 y: 2)

;; Using positional parameters
(print (add 1 2))