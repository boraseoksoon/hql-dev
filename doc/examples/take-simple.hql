;; Simple version without stdlib import
;; This demonstrates the issue with take.hql

;; Simplified take function
(fn take (n coll)
  (var result [])
  (loop (i 0)
    (if (< i n)
      (do
        (console.log "Taking element" i ":" (get coll i))
        (set! result (concat result [(get coll i)]))
        (recur (+ i 1)))
      nil))
  result)

;; Simplified range function  
(fn range (n)
  (var result [])
  (loop (i 0)
    (if (< i n)
      (do
        (set! result (concat result [i]))
        (recur (+ i 1)))
      nil))
  result)

;; Concat helper
(fn concat (a b)
  (js-call a "concat" b))

;; Test
(var r (range 10))
(console.log "Range 0-9:" r)
(console.log "First element:" (get r 0))
(console.log "Take 5:" (take 5 r))