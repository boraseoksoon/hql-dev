
(defn calculate (x y)
  (do
    (def sum (+ x y))
    (do
      (def diff (- x y))
      (list sum diff))))