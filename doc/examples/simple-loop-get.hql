;; Simple test for get in loop
(var arr [10 20 30])
(loop (i 0)
  (if (< i 3)
    (do
      (print "i=" i "value=" (get arr i))
      (recur (+ i 1)))
    nil))