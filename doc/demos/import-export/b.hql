;; Demo import/export cases (moved from examples)
(fn hello ()
  (console.log "Hello, world"))

(fn hey (name)
  (console.log (str "Hello, " name)))

(hey "yo")

(export [hello])
(export [hey])

