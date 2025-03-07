;; features.hql - Test all newly introduced HQL features

;; ===== Test list primitives =====

;; Test first, rest, cons
(def my-list (quote (1 2 3)))
(def first-item (first my-list))  ;; Should be 1
(def remaining (rest my-list))    ;; Should be (2 3)
(def new-list (cons 0 my-list))   ;; Should be (0 1 2 3)
(def list-size (length my-list))  ;; Should be 3

;; ===== Test logical operators =====

;; Test or
(def or-test1 (or true false))            ;; Should be true
(def or-test2 (or false "fallback"))      ;; Should be "fallback"
(def or-test3 (or 0 "zero is falsy"))     ;; Test with 0 (JS falsy)

;; Test and
(def and-test1 (and true "result"))       ;; Should be "result"
(def and-test2 (and false "never seen"))  ;; Should be false
(def and-test3 (and 42 "truthy number"))  ;; Test with number (JS truthy)

;; Test not
(def not-test1 (not true))                ;; Should be 0
(def not-test2 (not false))               ;; Should be 1
(def not-test3 (not "strings are truthy")) ;; Should be 0

;; ===== Test flow control =====

;; Test cond
(def x 5)
(def cond-result 
  (cond ((= x 1) "x is 1")
        ((= x 5) "x is 5")
        (else "x is something else")))     ;; Should be "x is 5"

;; Test fallthrough
(def y 10)
(def cond-fallthrough
  (cond ((= y 1) "y is 1")
        ((= y 2) "y is 2")
        (else "y is neither 1 nor 2")))    ;; Should use else clause

;; Test do - executing multiple expressions
(def result (do
  (def temp-a 10)
  (def temp-b 20)
  (+ temp-a temp-b)))                      ;; Should be 30

;; ===== Test advanced combinations =====

;; Combining macros
(def combined (if (and true true)
                  (or "first" "second")
                  "fallback"))              ;; Should be "first"

;; Function that uses our macros
(defn evaluate-score (score)
  (cond ((> score 90) "Excellent")
        ((> score 70) "Good")
        ((> score 50) "Satisfactory")
        (else "Needs improvement")))

;; Test the function
(def grades
  (list (evaluate-score 95)
        (evaluate-score 80)
        (evaluate-score 60)
        (evaluate-score 30)))

;; Export results for verification
(export "list-tests" (list first-item list-size))
(export "logic-tests" (list or-test1 and-test1 not-test1))
(export "control-tests" (list cond-result result))
(export "combined" combined)
(export "grades" grades)