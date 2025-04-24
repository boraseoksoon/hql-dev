;; hyphen-functions.hql - Contains identifiers that used to have hyphens
(fn multiply_by_five (x)
  (return (* x 5)))

(fn add_ten (x)
  (return (+ x 10)))

(export [multiply_by_five, add_ten])

(console.log "hyphen-functions.hql loaded")
(console.log "multiply_by_five(6) direct test:" (multiply_by_five 6))
(console.log "add_ten(7) direct test:" (add_ten 7))