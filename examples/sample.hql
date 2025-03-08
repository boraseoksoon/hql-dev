;; examples/dot-access.hql
;; Simplified example of dot notation that works with existing HQL features

;; Basic property access
(def pi-value Math.PI)

(console.log pi-value)
(console.log (pi-value))

;; No-parameter method call with runtime type checking
(def random-number (Math.random))

;; Method call with arguments
(def text "hello world")
(def upper-text (text.toUpperCase))
(console.log upper-text)

;; Create an array and manipulate it
(def numbers (new Array))
(numbers.push 1)
(numbers.push 2)
(numbers.push 3)
(console.log numbers)

;; Date methods
(def date (new Date))
(def current-year (date.getFullYear))

;; Export the values so they can be accessed
(export "pi" pi-value)
(export "random" random-number)
(export "upperText" upper-text)
(export "numbers" numbers)
(export "year" current-year)