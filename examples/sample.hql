;; Type predicate examples
(def symb 'hello)
(def lst '(1 2 3))
(def mp {"name" : "John"})

(symbol? symb)  ;; => true
(list? lst)     ;; => true
(map? mp)       ;; => true
(nil? nil)      ;; => true


;; Sequence operation examples
(def numbers '(1 2 3 4 5))

(first numbers)     ;; => 1
(rest numbers)      ;; => (2 3 4 5)
(next numbers)      ;; => (2 3 4 5) or nil if less than 2 elements
(seq numbers)       ;; => (1 2 3 4 5) or nil if empty
(empty? '())        ;; => true
(empty? numbers)    ;; => false

;; Collection manipulation examples
(def xs '(1 2 3))
(def ys '(4 5 6))

(conj xs 4)         ;; => (1 2 3 4)
(concat xs ys)      ;; => (1 2 3 4 5 6)
(concat xs '() ys)  ;; => (1 2 3 4 5 6)

;; Collection manipulation examples
(def xs '(1 2 3))
(def ys '(4 5 6))

(conj xs 4)         ;; => (1 2 3 4)
(concat xs ys)      ;; => (1 2 3 4 5 6)
(concat xs '() ys)  ;; => (1 2 3 4 5 6)


/* let is done.
;; Basic let with a single binding
(let (x 10)
  (+ x 5))

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
*/