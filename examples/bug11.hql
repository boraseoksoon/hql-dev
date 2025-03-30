(fn classify-number (n)
  (cond
    ((> n 100) "large")
    ((> n 50) "medium")
    ((> n 10) "small")
    ((> n 0) "tiny")
    ((= n 0) "zero")
    (else "negative")))  ;; Default case using "true" condition


(print (classify-number 10))