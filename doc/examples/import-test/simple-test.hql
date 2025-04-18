;; simple-test.hql - Basic function test
(fn double (x)
  (return (* x 2)))

(let result (double 10))
(console.log "Double 10:" result) 