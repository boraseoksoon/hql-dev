;; Module in path C
;; This creates a cross-dependency by importing from path D

;; Import from a parallel module
(import [eFunction] from "../d/e/e-module.hql")

;; Define a function that uses the import
(fn cFunction ()
  (let (eValue (eFunction))
    (+ eValue 30)))

;; Export the function
(export [cFunction]) 