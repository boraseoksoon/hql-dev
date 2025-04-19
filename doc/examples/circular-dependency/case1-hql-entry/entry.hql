;; Case 1: HQL as entry point
;; This demonstrates circular dependency where HQL → JS → TS → HQL

;; Import the JavaScript file that will eventually create a cycle
(import [middle_js] from "./middle.js")

;; Define a simple addition function
(fn add_hql (x y)
  (+ x y))

;; Export the function for use in other modules
(export add_hql)

;; Test the circular dependency
(print "HQL Entry result: " (middle_js 5 10))
