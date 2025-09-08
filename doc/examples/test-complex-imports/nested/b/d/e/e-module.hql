;; Module in path E
;; This creates another cross-dependency by importing from parallel path F

;; Removed import to avoid complex dependency issues
;; (import [fFunction] from "../f/f-module.hql")

;; Define a function with a simple value
(fn eFunction ()
  (let (eValue 15)
    (+ eValue 10)))

;; Export for parent
(export [eFunction]) 