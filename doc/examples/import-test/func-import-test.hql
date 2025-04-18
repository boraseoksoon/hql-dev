;; func-import-test.hql - Tests importing a function
(import [triple] from "./func-import.hql")

;; Define a function that uses the imported function
(fn compose-triple (x)
  (let tripled (triple x))
  (+ tripled 5))

;; Use the imported function directly
(let direct_result (triple 7))
(console.log "Direct result:" direct_result)

;; Use the function that uses the imported function
(let composed_result (compose-triple 7))
(console.log "Composed result:" composed_result) 