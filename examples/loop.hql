(let chained-result 
  (do
    (let filtered (numbers.filter (lambda (n) (> n 5))))
    (let mapped (filtered.map (lambda (n) (* n 2))))
    (mapped.reduce (lambda (acc n) (+ acc n)) 0))
    (console.log "Sum of doubled numbers > 5:" chained-result))