;; Workaround for the get-in-loop bug

(fn take-workaround (n coll)
  (var result [])
  ;; Use js-get instead of get
  (loop (i 0)
    (if (< i n)
      (do
        (var elem (js-call coll "at" i))  ; Use JS array.at() method
        (console.log "Element" i ":" elem)
        (set! result (concat result [elem]))
        (recur (+ i 1)))
      nil))
  result)

(fn concat (a b)
  (js-call a "concat" b))

(var arr [100 200 300 400 500])
(console.log "Array:" arr)
(console.log "Take 3:" (take-workaround 3 arr))