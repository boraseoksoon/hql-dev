;; The deepest level - provides a simple add-one macro
(defmacro add-one (x)
  (list '+ x 1))

(defmacro minus-one (x)
  (list '- x 1))

(defn addguy (x)
    (add-one x))

(defn minusguys (x)
    (minus-one x))

(export "minusguys" minusguys)
(export "addguy" addguy)