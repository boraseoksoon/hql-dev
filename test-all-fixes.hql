;; Test 1: Function calls
(fn square [x]
  (* x x))
(print "square(5)=" (square 5))

;; Test 2: Get in loops
(var nums [1 2 3])
(loop (i 0)
  (if (< i 3)
    (do
      (print (get nums i))
      (recur (+ i 1)))
    nil))

;; Test 3: Let bindings
(let [x 10
      y 20]
  (print "x+y=" (+ x y)))
