(for-loop (i to: 10) (print "Test 1: " i))
(print "**********")
(for-loop (i from: 5 to: 10) (print "Test 2: " i))
(print "**********")
(for-loop (i from: 0 to: 10 by: 2) (print "Test 3: " i))




















































/*
(loop (i 0)
  (when (< i 2)
    (do
      (print i)
      (recur (+ i 1)))
    nil))
;; 0 
;; 1

(var count 0)
(while (< count 3)
  (print "While iteration:" count)
  (set! count (+ count 1)))

(print "Final count:" count)

;; While iteration: 0
;; While iteration: 1
;; While iteration: 2
;; Final count: 3

(for (i 3)         ;; iterate i from 0 to 3
  (print "(1) i : " i))

(for (i 5 10)       ;; iterate i from 5 to 9
  (print "(2) i : " i))

(for (i 0 10 2)     ;; iterate i from 0 to 9 by steps of 2
  (print "(3) i : " i))
*/