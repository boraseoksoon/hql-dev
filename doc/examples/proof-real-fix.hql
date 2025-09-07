;; Proof that this is a real fix, not a workaround

;; Test 1: Direct get in loop
(var nums [100 200 300 400 500])
(print "Test 1: Get in loop")
(loop (idx 0)
  (if (< idx 5)
    (do
      (print "  nums[" idx "] =" (get nums idx))
      (recur (+ idx 1)))
    nil))

;; Test 2: Nested loops with get
(print "\nTest 2: Nested loops")
(var matrix [[1 2] [3 4] [5 6]])
(loop (i 0)
  (if (< i 3)
    (do
      (loop (j 0)
        (if (< j 2)
          (do
            (print "  matrix[" i "][" j "] =" (get (get matrix i) j))
            (recur (+ j 1)))
          nil))
      (recur (+ i 1)))
    nil))

;; Test 3: Get with computed index
(print "\nTest 3: Computed index")
(loop (x 0)
  (if (< x 3)
    (do
      (var computed-idx (* x 2))
      (print "  nums[" computed-idx "] =" (get nums computed-idx))
      (recur (+ x 1)))
    nil))