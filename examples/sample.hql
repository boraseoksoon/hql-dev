(defn classify-number (x)
  (cond
    ((< x 0) "negative")
    ((= x 0) "zero")
    ((< x 10) "small positive")
    ((< x 100) "medium positive")
    (true "large positive")))

(console.log (classify-number 10))
(console.log (classify-number 100))