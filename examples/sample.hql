;; comprehensive-test.hql - Tests all macros working together

;; ----- Test Logical Operators -----

;; Test or
(def or-test1 (or true false))            ;; Should be true
(def or-test2 (or false "fallback"))      ;; Should be "fallback"

;; Test and
(def and-test1 (and true "result"))       ;; Should be "result"
(def and-test2 (and false "never seen"))  ;; Should be false

;; Test not
(def not-test1 (not true))                ;; Should be 0
(def not-test2 (not false))               ;; Should be 1

;; ----- Test Comparison Operators -----

(def a 10)
(def b 5)
;; ----- Test Control Flow -----

;; Test do
(def do-result (do
  (def temp-a 10)
  (+ temp-a a)))                          ;; Should be 20

;; ----- Test Function Definition -----

;; Define a simple function using defn
(defn is-positive (n)
  (> n 0))

;; Test the function
(def fn-test1 (is-positive 5))            ;; Should be true
(def fn-test2 (is-positive -3))           ;; Should be false

;; ----- Test Complex Combinations -----


;; Test the complex function
(def range-test1 (check-range 15 10 20))  ;; Should be true
(def range-test2 (check-range 5 10 20))   ;; Should be false

;; ----- Export Results -----

;; Export all results for verification
(export "all-tests" (list 
  ;; Logical tests
  or-test1 or-test2 and-test1 and-test2 not-test1 not-test2
  
  ;; Comparison tests
  gt-test lt-test gte-test lte-test eq-test
  
  ;; Control flow tests
  do-result cond-result1 cond-result2
  
  ;; Function tests
  fn-test1 fn-test2
  
  ;; Complex tests
  complex1 complex2 range-test1 range-test2
))