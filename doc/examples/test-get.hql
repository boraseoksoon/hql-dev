;; Test get function issue

(console.log "=== Direct get test ===")
(var arr [100 200 300])
(console.log "Array:" arr)
(console.log "Direct get 0:" (get arr 0))
(console.log "Direct get 1:" (get arr 1))

(console.log "\n=== Get inside function ===")
(fn test-get (coll)
  (console.log "In function, coll:" coll)
  (console.log "In function, get 0:" (get coll 0))
  (console.log "In function, get 1:" (get coll 1)))

(test-get arr)

(console.log "\n=== Get inside loop ===")
(fn test-loop (coll)
  (console.log "Starting loop with:" coll)
  (loop (i 0)
    (if (< i 3)
      (do
        (console.log "  Loop i=" i "get:" (get coll i))
        (recur (+ i 1)))
      nil)))

(test-loop arr)