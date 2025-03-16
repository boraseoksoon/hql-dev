;; The deepest level - provides a simple add-one macro
(defmacro add-one (x)
  (list '+ x 1))

(defn addguy (x)
    (add-one x))

;; Export for use by utils.js
(export "addguy" addguy)