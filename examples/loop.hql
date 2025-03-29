(loop (i 0)
  (when (< i 10)
    (print i)
    (recur (+ i 1))))