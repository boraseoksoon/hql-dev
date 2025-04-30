(fn hello (name)
  (console.log (str "Hello, " name)))

(fn hey (name)
  (console.log (str "Hello, " name)))

(hey "yo")

(export [hello])
(export [hey])
