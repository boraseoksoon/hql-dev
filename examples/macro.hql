(do
  (print "Starting process...")
  (print "Executing step 1")
  (print "Executing step 2")
  (+ 1 2))

(import chalk "jsr:@nothing628/chalk@1.0.0")

(defmacro color-text (color text)
  `(console.log (js-call chalk ~color ~text)))

(color-text "red" "This should be red!")
(color-text "blue" "This should be blue!")
(color-text "yellow" "This should be yellow!")
(console.log (str "hello " "world"))

(print (str "hello" " " "world"))


(def my-set #[1, 2, 3, 4, 5])
(print "Should be true:" (contains? my-set 3))
(print "Should be false:" (contains? my-set 42))

;; Create a vector for testing
(def my-vector [10, 20, 30, 40, 50])

;; Retrieve elements using nth
(print "Element at index 0 (should be 10):" (nth my-vector 0))
(print "Element at index 2 (should be 30):" (nth my-vector 2))
(print "Element at index 4 (should be 50):" (nth my-vector 4))


;; cond-test.hql - Test file specifically for cond macro

;; Test the cond macro with a simple function
(defn test-cond (x)
  (cond
    ((< x 0) "negative")
    ((= x 0) "zero")
    ((< x 10) "small positive")
    ((< x 100) "medium positive")
    (true "large positive")))

;; Test with various values
(print "Testing cond with -5:" (test-cond -5))
(print "Testing cond with 0:" (test-cond 0))
(print "Testing cond with 5:" (test-cond 5))
(print "Testing cond with 50:" (test-cond 50))
(print "Testing cond with 500:" (test-cond 500))

;; Test empty cond (should return nil)
(defn test-empty-cond ()
  (cond))

(print "Testing empty cond:" (test-empty-cond))

;; Test nested cond expressions
(defn test-nested-cond (x y)
  (cond
    ((< x 0) "x is negative")
    ((= x 0) (cond
               ((< y 0) "x is zero, y is negative")
               ((= y 0) "x and y are both zero")
               (true "x is zero, y is positive")))
    (true "x is positive")))

(print "Testing nested cond with (0, -5):" (test-nested-cond 0 -5))
(print "Testing nested cond with (0, 0):" (test-nested-cond 0 0))
(print "Testing nested cond with (0, 5):" (test-nested-cond 0 5))