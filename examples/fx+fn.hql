;; bug_fix_test.hql
;; Simple test case to verify fixes for rest parameters and array types

;; Import reduce from stdlib
(import [reduce] from "../lib/stdlib/stdlib.hql")

;; 1. Test for rest parameter bug fix
(fn sum (x y & rest)
  (+ x y (reduce + 0 rest)))

;; 2. Test for array type notation
(fn get-names () (-> [String])
  ["Alice" "Bob" "Charlie"])

;; 3. Test function taking array as parameter
(fn first-name (names: [String]) (-> String)
  (get names 0))

;; Run tests
(fn run-tests ()
  ;; Test rest parameter
  (js-call console "log" "Testing rest parameter:")
  (js-call console "log" (sum 1 2))
  (js-call console "log" (sum 1 2 3 4 5))
  
  ;; Test array return type
  (js-call console "log" "Testing array return type:")
  (js-call console "log" (get-names))
  
  ;; Test array parameter type
  (js-call console "log" "Testing array parameter:")
  (js-call console "log" (first-name (get-names)))
  
  "Tests completed")

;; Export the test function
(export "runTests" run-tests)