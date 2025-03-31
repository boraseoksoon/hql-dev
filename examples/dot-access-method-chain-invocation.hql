;; dot-access-method-chain-invocation.hql
;; This program demonstrates both styles of method chaining in HQL

;; Define a simple array to work with
(var numbers [1 2 3 4 5 6 7 8 9 10])

;; Define a string to work with
(var message "   Hello, HQL Chain Methods!   ")

;; ========================================================================
;; PART 1: Traditional S-expression style (nested function calls)
;; ========================================================================

(print "--- Traditional S-expression Style ---")

;; Example 1: Array processing with filter and map
(print "Example 1: Array processing")
(print "Original array: " numbers)

(print "Process even numbers: "
  (map (lambda (n) (* n 2))
       (filter (lambda (n) (= (% n 2) 0)) 
               numbers)))