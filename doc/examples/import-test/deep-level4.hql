;; deep-level4.hql - Fourth level in the deep nesting test

;; Import from a remote module to test deep remote dependencies
(import [add] from "npm:lodash")

;; Define a function that uses the import
(fn addTen (x)
  (add x 10))

;; Export the function
(export [addTen])

(console.log "deep-level4.hql loaded") 