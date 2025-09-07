;; test-module.hql - A module to be imported
(fn add (a b) (+ a b))
(fn multiply (x y) (* x y))
(fn greet (name) (str "Hello, " name "!"))

;; Export the functions
(export [add multiply greet])