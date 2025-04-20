;; Test file with deliberate syntax error

(fn testFunction (x)
  (+ x 10))

;; Missing closing parenthesis in this expression
(export [testFunction] 