
;; Creating JS objects
(let numbers (new Array))
(numbers.push 1)
(numbers.push 2)
(numbers.push 3)
(numbers.push 4)
(numbers.push 5)
(numbers.push 6)
(numbers.push 7)
(print numbers)

;; --- Test 4: Basic Method Chaining ---
;; Approach 1: Store intermediate results
(let even-numbers (numbers.filter (lambda (n) (= (% n 2) 0))))
(let doubled-evens (even-numbers.map (lambda (n) (* n 2))))
(console.log "Doubled evens (step by step):" doubled-evens)
(print "collection length: " [1, 2, 3, 4, 5, 6, 7, 8].filter(lambda (n) (> n 5)))


[1, 2, 3, 4, 5, 6, 7, 8].filter(lambda (n) (> n 5))