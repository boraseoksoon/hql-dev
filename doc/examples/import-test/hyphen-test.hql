;; hyphen-test.hql - Tests import of identifiers that used to have hyphens
(import [multiply_by_five, add_ten] from "./hyphen-functions.hql")

(console.log "Underscore identifiers test")
(let result1 (multiply_by_five 6))
(let result2 (add_ten 7))
(console.log "multiply_by_five(6):" result1)
(console.log "add_ten(7):" result2) 

(export [multiply_by_five, add_ten])