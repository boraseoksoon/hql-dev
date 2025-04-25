;; a.hql

(defmacro hello (name)
  `(console.log (+ "Hello, " ~name "!")))

(export [hello])