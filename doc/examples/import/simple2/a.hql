;; a.hql

(fn greeting (name)
  (console.log (+ "Hello... " name "!")))

(fn farewell (name)
  (console.log (+ "Goodbye, " name "!")))

(export [greeting, farewell])
