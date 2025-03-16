;; Use built-in macros (from core.hql)
(if (> 5 3)
  (console.log "Five is greater than three")
  (console.log "This won't be printed"))

;; Use the do macro
(do
  (def x 10)
  (def y 20)
  (console.log "Sum:" (+ x y)))