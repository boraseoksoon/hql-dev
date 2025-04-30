(fn hello (name)
  (console.log (str "Hello, " name)))

(fn hey (name)
  (console.log (str "Hello, " name)))

(hey "yo" "man")

(export [hello])
(export [hey])
