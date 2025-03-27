;; Simple loop/recur example
(print "Testing loop/recur with counter:")

(loop (i 0)
  (if (< i 5)
    (do
      (print "Iteration:" i)
      (recur (+ i 1)))
    (print "Loop complete!")))

;; Simple factorial example
(print "\nFactorial example:")

(let factorial-loop 
  (lambda (n)
    (loop (i 1
           acc 1)
      (if (> i n)
        acc
        (recur (+ i 1) (* acc i))))))

(print "Factorial of 5 =" (factorial-loop 5))