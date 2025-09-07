(var numbers (new Array))
(numbers.push 1)
(numbers.push 2)
(numbers.push 3)
(numbers.push 4)
(numbers.push 5)
(numbers.push 6)
(numbers.push 7)
(print numbers)

;; Approach 2: Use do block with temporary variables
(var chained-result 
  (do
    (var filtered (numbers.filter (lambda (n) (> n 5))))
    (var mapped (filtered.map (lambda (n) (* n 2))))
    (mapped.reduce (lambda (acc n) (+ acc n)) 0)))
    
(console.log "Sum of doubled numbers > 5:" chained-result)