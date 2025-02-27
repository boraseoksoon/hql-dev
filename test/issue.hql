;; Local module (if needed)
(def mod (import "./simple2.hql"))

;; Part 1: Local module usage and greetings
(defn greet (name)
  (str (mod.sayHi name) " Welcome to HQL.")
)
;; For testing, call greet and print its result.
(print (greet "Alice"))

(export "greet" greet)
