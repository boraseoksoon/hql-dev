(loop (i 0)
  (when (< i 10)
    (do
      (print i)
      (recur (+ i 1)))
    nil))