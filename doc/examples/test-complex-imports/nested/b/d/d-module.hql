;; Module in path D
;; This imports from both deeper submodules E and F

;; Import from both submodules
(import [eFunction] from "./e/e-module.hql")
(import [fFunction] from "./f/f-module.hql")

;; Define a function that combines the imports
(fn dFunction ()
  (let (eValue (eFunction)
        fValue (fFunction))
    (+ eValue fValue)))

;; Export for parent
(export [dFunction]) 