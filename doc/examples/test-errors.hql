;; Test cases for improved error reporting

;; Test case 1: Unclosed parenthesis
(let number 10

;; Test case 3: Extra closing parenthesis
(let x 5))

;; Test case 4: Nested unclosed parenthesis
(if (= x 10
  (print "x is 10")
  (print "x is not 10"))

;; Test case 5: Multiple nested errors
(let outer (let inner (fn [a b]
  (+ a b)
</rewritten_file> 