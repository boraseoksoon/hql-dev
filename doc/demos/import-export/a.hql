;; Demo import/export cases (moved from examples)
(import b from "./b.hql")
(import [hello] from "./b.hql")

(b.hello)
(hello)

(var numbers (new Array))
(numbers.push 1)
(numbers.push 2)
(numbers.push 3)
(numbers.push 4)
(numbers.push 5)
(numbers.push 6)
(numbers.push 7)
(print numbers)

(fn hello ()
  (console.log "Hello, world"))

(fn hey (name)
  (console.log (str "Hello, " name)))

(hey "yo")

(export [hello])
(export [hey])

