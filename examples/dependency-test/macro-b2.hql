;; macro-b.hql - Using proper quasiquote syntax for macros

(import utils from "./utils.js")

(def js_double (utils.double 10))
(def js_minus (utils.minus 10))

(export [js_minus, js_double])