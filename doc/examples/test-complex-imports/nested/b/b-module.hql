;; Module in path B
;; This imports from both nested subpaths C and D

;; Import from two different subpaths
(import [cFunction] from "./c/c-module.hql")
(import [dFunction] from "./d/d-module.hql")

;; Define a function that combines the imports
(fn bFunction ()
  (let (cValue (cFunction)
        dValue (dFunction))
    (+ cValue dValue)))

;; Export for the entry
(export [bFunction]) 