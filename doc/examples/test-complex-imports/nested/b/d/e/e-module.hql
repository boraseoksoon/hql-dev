;; Module in path E
;; This creates another cross-dependency by importing from parallel path F

;; Import from parallel path
(import [fFunction] from "../f/f-module.hql")

;; Define a function that uses the import
(fn eFunction ()
  (let ((fValue (fFunction)))
    (+ fValue 10)))

;; Export for parent
(export [eFunction]) 