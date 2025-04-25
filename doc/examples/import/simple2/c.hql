;; c.hql

(fn greeting2 (name)
  (console.log (+ "Hello~~ " name "!")))

(fn farewell2 (name)
  (console.log (+ "Goodbye, " name "!")))

(export [greeting2, farewell2])
