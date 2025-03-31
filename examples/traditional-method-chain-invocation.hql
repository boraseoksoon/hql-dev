;; simple-chain-demo.hql
;; A minimal script to demonstrate both styles of method chaining

;; Create an array
(var numbers [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

(print "Original array:" numbers)

;; Traditional style using JavaScript's array methods
(print "\nTraditional style result:")
(print (.map (.filter numbers (lambda (n) (= (% n 2) 0)))
             (lambda (n) (* n 2))))