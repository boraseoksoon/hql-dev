
;; Assume core macros (including when, unless, inc, dec, etc.) are loaded.

;; Define a variable.
(def x 10)

;; Use 'when' to log a message if x is greater than 5.
(when (> x 5)
  (js-call console "log" "x is greater than 5"))

;; Use 'unless' to log a message if x is not less than 5.
(unless (< x 5)
  (js-call console "log" "x is not less than 5"))


;; Use 'inc' to compute x+1.
(def x_plus_one (inc x))

;; Use 'dec' to compute x-1.
(def x_minus_one (dec x))

(console.log x_plus_one)
(console.log x_minus_one)

(defn x_plus_one2 (x) (inc x))
(console.log (x_plus_one2 1))
