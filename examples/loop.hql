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