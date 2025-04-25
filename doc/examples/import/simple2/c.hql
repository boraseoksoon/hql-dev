;; c.hql

(defmacro greeting2 (name)
  `(console.log (+ "Hello~~ " ~name "!")))

(defmacro farewell2 (name)
  `(console.log (+ "Goodbye, " ~name "!")))

(export [greeting2, farewell2])
