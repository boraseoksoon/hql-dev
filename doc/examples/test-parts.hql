;; Test each part separately

;; 1. Test range function
(fn range (n)
  (var result [])
  (loop (i 0)
    (if (< i n)
      (do
        (set! result (concat result [i]))
        (recur (+ i 1)))
      nil))
  result)

(fn concat (a b)
  (js-call a "concat" b))

(console.log "=== TEST 1: Range ===")
(var r (range 5))
(console.log "Range result:" r)
(console.log "Type:" (typeof r))
(console.log "Length:" (length r))
(console.log "Element 0:" (get r 0))
(console.log "Element 1:" (get r 1))

;; 2. Test get on array
(console.log "\n=== TEST 2: Get ===")
(var arr [10 20 30])
(console.log "Array:" arr)
(console.log "Get 0:" (get arr 0))
(console.log "Get 1:" (get arr 1))

;; 3. Test passing array to function
(console.log "\n=== TEST 3: Pass to function ===")
(fn test-param (coll)
  (console.log "Received:" coll)
  (console.log "Type:" (typeof coll))
  (console.log "Get 0:" (get coll 0)))

(test-param r)
(test-param arr)

;; 4. Test take with literal array
(console.log "\n=== TEST 4: Take with literal ===")
(fn take (n coll)
  (console.log "Take called with n:" n "coll:" coll)
  (var result [])
  (loop (i 0)
    (if (< i n)
      (do
        (var elem (get coll i))
        (console.log "  Element" i ":" elem)
        (set! result (concat result [elem]))
        (recur (+ i 1)))
      nil))
  result)

(console.log "Result:" (take 3 [100 200 300 400]))