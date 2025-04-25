;; a.hql

(defmacro greeting (name)
  `(console.log (+ "Hello... " ~name "!")))

(defmacro farewell (name)
  `(console.log (+ "Goodbye, " ~name "!")))

(export [greeting, farewell])
