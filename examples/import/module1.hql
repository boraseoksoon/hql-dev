;; module1.hql

(defn add (x y)
  (+ x y))

(defn subtract (x y)
  (- x y))

(defn multiply (x y)
  (* x y))

(defn divide (x y)
  (/ x y))

(export [add, subtract, multiply, divide])