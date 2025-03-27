;; examples/fx.hql - Simple test for pure functions

;; Basic pure function
(fx add (x y)
  (+ x y))

;; Recursive pure function
(fx factorial (n)
  (if (< n 2)
      1
      (* n (factorial (- n 1)))))

;; Pure function that uses js-call (should be allowed)
(fx add-to-array (arr item)
  (js-call arr "push" item)
  arr)

;; Pure function that uses js-set (should be allowed)
(fx update-object (obj key value)
  (js-set obj key value)
  obj)

;; Test execution
(print "add(5, 10) =>" (add 5 10))
(print "factorial(5) =>" (factorial 5))

;; Test array modification
(let my-array [1, 2, 3])
(let result (add-to-array my-array 4))
(print "Original array:" my-array)
(print "Result:" result)

;; Test object modification
(let my-object (hash-map "name" "John"))
(let updated (update-object my-object "age" 30))
(print "Original object:" my-object)
(print "Updated object:" updated)