;; Module in path F (deepest level)
;; This creates a complex cross-branch dependency by importing from a completely different path

;; Import from a completely different branch
;; Removed cross-branch import to avoid circular dependency
;; (import [aFunction] from "../../../a/a-module.hql")

;; Define a function with a base value
(fn fFunction ()
  (let (baseValue 5)
    (+ baseValue 5)))

;; Export for parent
(export [fFunction]) 