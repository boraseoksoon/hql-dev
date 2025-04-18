;; hyphen-functions.hql - Contains identifiers that used to have hyphens
(fn multiply_by_five (x)
  (return (* x 5)))

(fn add_ten (x)
  (return (+ x 10)))

(export [multiply_by_five, add_ten])

(console.log "hyphen-functions.hql loaded") 