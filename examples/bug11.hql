(print 
  ([1, 2, 3, 4, 5, 6, 7, 8]
    .filter (lambda (n) (> n 5))
    .length
  )
)

;; 3

(print 
  ([1, 2, 3, 4, 5, 6, 7, 8]
    .filter (lambda (n) (= (% n 2) 0))
    .map    (lambda (n) (* n 2)))
)

;; [ 4, 8, 12, 16 ]