(fn square [x]
  (* x x))

;; Test 1: Just the function call
(var result1 (square 5))
(print result1)

;; Test 2: Print with concatenation  
(print (str "square(5)=" (square 5)))
