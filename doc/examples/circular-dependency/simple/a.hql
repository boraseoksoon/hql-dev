;; Simple circular dependency test - File A (HQL)

;; Import from file B, creating circular dependency
(import add_js from "./b.js")

;; Define a simple function
(fn multiply_hql (x y)
  (* x y))

;; Export the function
(export multiply_hql)

;; Use the imported function 
(print "Result from HQL file: " (add_js 5 10))
