;; Module in path A
;; This imports from a different branch in the import tree

;; Import from path B, creating a cross-branch dependency
(import [cFunction] from "../b/c/c-module.hql")

;; Also define a deep function that will be imported directly by the main entry
(fn deepFunction ()
  (let (cValue (cFunction))
    (+ cValue 1000)))

;; Define a function that uses the import
(fn aFunction ()
  (let (cValue (cFunction))
    (* cValue 2)))

;; Export both functions
(export [aFunction deepFunction]) 