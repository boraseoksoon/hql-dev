;; Define a macro that squares its argument.
(defmacro square (x)
  `(* ~x ~x))