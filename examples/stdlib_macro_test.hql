;; stdlib_macro_test.hql - Testing macros with stdlib and remote imports

(def numbers [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

;; Test the mapfilter macro which uses local stdlib
(def doubled-evens 
  (mapfilter 
    (fn (x) (= (% x 2) 0))  ;; Keep only even numbers
    (fn (x) (* x 2))        ;; Double each number
    numbers))

(print "Doubled even numbers:" doubled-evens)
;; Should output: [4, 8, 12, 16, 20]

;; Test the chunk-array macro which uses remote lodash
(def chunked-numbers (chunk-array numbers 3))

(print "Numbers chunked into groups of 3:" chunked-numbers)
;; Should output: [[1,2,3], [4,5,6], [7,8,9], [10]]