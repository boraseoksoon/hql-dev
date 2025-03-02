;; Case 1: Implicit return type, explicit parameter types, no defaults
(defn add (x: Int y: Int)
  (+ x y))

;; Case 2: Explicit return type, explicit parameter types, no defaults
(defn add (x: Int y: Int) -> Int
  (+ x y))

;; Case 3: All types inferred (parameters and return), no defaults
(defn add (x y)
  (+ x y))

;; Case 4: Implicit return type, explicit parameter types with default value
(defn add (x: Int y: Int = 0)
  (+ x y))

;; Case 5: Explicit return type, explicit parameter types with default value
(defn add (x: Int y: Int = 0) -> Int
  (+ x y))

;; Case 6: Implicit return type, inferred parameter types with default value
(defn add (x y = 0)
  (+ x y))

;; Case 7: Explicit return type, inferred parameter types with default value
(defn add (x y = 0) -> Int
  (+ x y))
