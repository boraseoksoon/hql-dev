(class Person
  ;; Class fields
  (var name)
  (var age)

  ;; Constructor that properly sets fields
  (constructor (name age)
    (do
      (set! this.name name)
      (set! this.age age)))

  ;; Simple getter methods
  (fn getName ()
    this.name)
    
  (fn getAge ()
    this.age)
)

;; Create an instance with name and age
(let person (new Person "Alice" 30))

;; Print attributes
(print "  Name:" person.name)
(print "  Age:" person.age)

;; Call methods to get the values (note the parentheses after method name)
(print "  getName():" (person.getName))
(print "  getAge():" (person.getAge))

;; Example class with both fn and fx methods
(class Calculator
  ;; Class fields
  (var baseValue)

  ;; Constructor
  (constructor (baseValue)
    (do
      (set! this.baseValue baseValue)
      this))

  ;; Regular fn method
  (fn increment (amount)
    (+ this.baseValue amount))
    
  ;; Typed fx method
  (fx add (x: Int y: Int) (-> Int)
    (+ x y))
    
  ;; Another fx method with default value
  (fx multiply (x: Int y: Int = 2) (-> Int)
    (* x y))
    
  ;; Complex fx method with multiple parameters
  (fx calculate (a: Int b: Int operation: String = "add") (-> Int)
    (if (= operation "add")
        (+ a b)
        (if (= operation "multiply")
            (* a b)
            (if (= operation "subtract")
                (- a b)
                (/ a b)))))
)

;; Create an instance
(let calc (new Calculator 10))

;; Test the methods
(print "Regular method: calc.increment(5) =>" (calc.increment 5))
(print "fx method: calc.add(3, 4) =>" (calc.add 3 4))
(print "fx method with default: calc.multiply(5) =>" (calc.multiply 5))
(print "fx method with named args: calc.calculate(10, 5, 'multiply') =>" (calc.calculate 10 5 "multiply"))