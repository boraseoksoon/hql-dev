;; test/test.hql

;; Without explicit "return" keyword:

;; Case 1: Implicit return type, explicit parameter types, no defaults
(fx add1 (x: Int y: Int)
  (+ x y))

;; Case 2: Explicit return type, explicit parameter types, no defaults
(fx add2 (x: Int y: Int) -> Int
  (+ x y))

;; Case 3: All types inferred (parameters and return), no defaults
(fx add3 (x y)
  (+ x y))

;; Case 4: Implicit return type, explicit parameter types with default value
(fx add4 (x: Int y: Int = 0)
  (+ x y))

;; Case 5: Explicit return type, explicit parameter types with default value
(fx add5 (x: Int y: Int = 0) -> Int
  (+ x y))

;; Case 6: Implicit return type, inferred parameter types with default value
(fx add6 (x y = 0)
  (+ x y))

;; Case 7: Explicit return type, inferred parameter types with default value
(fx add7 (x y = 0) -> Int
  (+ x y))


;; With explicit "return" keyword:

;; Case 8: Implicit return type, explicit parameter types, no defaults, explicit return
(fx add8 (x: Int y: Int)
  (return (+ x y)))

;; Case 9: Explicit return type, explicit parameter types, no defaults, explicit return
(fx add9 (x: Int y: Int) -> Int
  (return (+ x y)))

;; Case 10: All types inferred (parameters and return), no defaults, explicit return
(fx add10 (x y)
  (return (+ x y)))

;; Case 11: Implicit return type, explicit parameter types with default value, explicit return
(fx add11 (x: Int y: Int = 0)
  (return (+ x y)))

;; Case 12: Explicit return type, explicit parameter types with default value, explicit return
(fx add12 (x: Int y: Int = 0) -> Int
  (return (+ x y)))

;; Case 13: Implicit return type, inferred parameter types with default value, explicit return
(fx add13 (x y = 0)
  (return (+ x y)))

;; Case 14: Explicit return type, inferred parameter types with default value, explicit return
(fx add14 (x y = 0) -> Int
  (return (+ x y)))
