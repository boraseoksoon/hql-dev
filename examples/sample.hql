(let (x 10 y 20 z 30) 
  ((+ x y z)))

(let (x 10)
  (console.log (+ x 5)))

;; Let with multiple bindings
(let (x 10
      y 20)
  (+ x y))

;; Nested let expressions
(let (outer 5)
  (let (inner (+ outer 2))
    (* outer inner)))

;; Let with expressions as binding values
(let (sum (+ 2 3)
      product (* 4 5))
  (list sum product))

;; Using let inside a function definition
(defn calculate (base)
  (let (squared (* base base)
        cubed (* squared base))
    (+ squared cubed)))

(calculate 3)