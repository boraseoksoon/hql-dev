;; Deeply nested imports - Entry file
;; This file starts a chain of imports that goes several levels deep

;; Import from both parallel paths
(import [aFunction] from "./a/a-module.hql")
(import [bFunction] from "./b/b-module.hql")

;; Function that combines results from both paths
(fn nestedFunction ()
  (let (aResult (aFunction)
        bResult (bFunction))
    (+ aResult bResult)))

;; Export for main entry
(export [nestedFunction]) 