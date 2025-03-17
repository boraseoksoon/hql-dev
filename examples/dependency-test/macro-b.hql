;; macro-b.hql - Using proper quasiquote syntax for macros

(def double-five (* 5 2))
(def doubled-and-added (+ 10 1))

(console.log "double-five : " double-five)
(console.log "doubled-and-added : " doubled-and-added)

(export "double-five" double-five)
(export "doubled-and-added" doubled-and-added)