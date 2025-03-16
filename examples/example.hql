;; Define a simple add-one function using existing HQL primitives
(def number 5)
(def result (+ number 1))

;; Output for verification
(console.log "Number:" number)
(console.log "Result:" result)

(def a 10)
(defmacro double-man (x)
  `(* ~x a))

(console.log "double man a yo: " (double-man 20))