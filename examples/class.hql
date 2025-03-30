(class Person
  ;; Class fields
  (var name)
  (var age)

  ;; Constructor that properly sets fields
  (constructor (name age)
    (do
      (set! this.name name)
      (set! this.age age)
      self))

  (fx add (x: Int y: Int) (-> Int)
    (+ x y))
)

;; Create an instance with name and age
(let person (new Person "Alice" 30))

(print person)
;; Print attributes
(print "  Name:" person.name)
(print "  Age:" person.age)

(print "  add:" (person.add 10 20))