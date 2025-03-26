;; -- Test loop/recur with a counter --
(def count-up 
  (loop (i 0)
    (if (< i 5)
      (recur (+ i 1))
      i)))

;; -- Test while loop with a counter --
(def while-test
  (let (count 0)
    (while (< count 5)
      (print "While iteration:" count)
      (set! count (+ count 1)))
    count))

;; Set! test - keep it simple
(def set-test
  (let (x 0)
    (set! x 10)
    x))

(print "Set! test result:" set-test)

;; (def z 10)
;; (print "before set z : " z)

;; (set! z 1)
;; (print "after set z : " z)