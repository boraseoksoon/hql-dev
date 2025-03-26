;; Example 1: Simple counter with loop/recur
(def count-to-10
  (loop (i 0)
    (if (< i 10)
      (do
        (print "Count:" i)
        (recur (+ i 1)))
      i)))

;; Example 2: Fibonacci sequence using loop/recur with multiple bindings
(def fibonacci-10
  (loop (a 0
         b 1
         n 10)
    (if (= n 0)
      a
      (recur b (+ a b) (- n 1)))))

;; Example 3: Simple while loop
(def while-counter
  (let (x 0)
    (while (< x 5)
      (print "While loop:" x)
      (set! x (+ x 1)))
    x))

;; Example 4: Find an element in a vector using loop/recur
(def find-element
  (loop (arr [1 2 3 4 5]
         i 0)
    (cond
      ((>= i (length arr)) 
        -1)  ;; Not found
      ((= (get arr i) 3) 
        i)   ;; Found at position i
      (true
        (recur arr (+ i 1))))))  ;; Continue searching

;; Print results
(print "Count result:" count-to-10)
(print "Fibonacci result:" fibonacci-10)
(print "While loop result:" while-counter)
(print "Find element result:" find-element)