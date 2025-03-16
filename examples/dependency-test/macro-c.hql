;; The deepest level - provides a simple add-one macro
(defmacro add-one (x)
  (list '+ x 1))

;; Export for use by utils.js
(export "add-one" add-one)