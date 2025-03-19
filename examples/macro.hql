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
