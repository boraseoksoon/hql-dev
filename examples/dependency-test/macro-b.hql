;; macro-b.hql - Using proper quasiquote syntax for macros

(import utils from "./utils.js")

(def double-five (* 5 2))
(def doubled-and-added (+ 10 1))

(def js-double (utils.double 10))
(def js-minus (utils.minus 10))

(export "double-five" double-five)
(export "doubled-and-added" doubled-and-added)
(export "js-minus" js-minus)
(export "js-double" js-double)