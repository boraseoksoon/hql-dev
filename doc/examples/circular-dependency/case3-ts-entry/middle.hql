;; Middle HQL file in Case 3
;; This demonstrates circular dependency where TS → HQL → JS → TS

;; Import the JS file that will be part of the cycle
(import { log_js } from "./final.js")

;; Define a simple power function
(fn power_hql (base exponent)
  (Math.pow base exponent))

;; Export the function for use in other modules
(export power_hql)

;; Test the circular dependency
(print "HQL middle result: " (log_js 100))
