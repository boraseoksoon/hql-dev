;; FX Specification Showcase
;; ==============================================

;; Case 1: Implicit return type, explicit parameter types, no defaults.
(fx add1 (x: Int y: Int) (-> Void)
  (+ x y))

;; Case 2: Explicit return type, explicit parameter types with default value
(fx add2 (x: Int y: Int = 0) (-> Void)
  (+ x y))

;; Case 3: Void return can be ignored
(fx add3 (x: Int = 10 y: Int = 0)
  (+ x y))

;; Case 4: Explicit return type, explicit parameter types, no defaults, explicit return
(fx add4 (x: Int y: Int) (-> Int)
  (return (+ x y)))

;; Case 5: Explicit return type, explicit parameter types with default value, explicit return
(fx add5 (x: Int y: Int = 0) (-> Int)
  (return (+ x y)))

;; How to call fx functions
;; ==============================================

;; Case 1: Named parameters
(add1 x: 10 y: 20)

;; Case 2: Default values
(add2 x: 10)  ;; default value y being 0
(add2 x: 10 y: 40) ;; you can override default value

;; Case 3: Using all defaults
(add3) ;; use all default values
(add3 x: 10) ;; x override, y will be 0
(add3 y: 10) ;; y override, x will be 10
(add3 x: 100 y: 100) ;; override both

;; Case 4: Functions with return values
(add4 x: 10 y: 20) ;; returns x + y

;; Case 5: Functions with return values and defaults
(add5 x: 10) ;; y defaults to 0, returns x + y

;; DEFN Specification
;; ==============================================

;; Basic defn function: positional parameters, implicit return
(defn defn-add (x y)
  (+ x y))

;; Usage with positional parameters
(defn-add 10 20)  ;; implicit return, returns 30

;; defn with explicit return
(defn defn-add-2 (x y)
  (return (+ x y)))

;; Usage with explicit return
(defn-add-2 10 20)  ;; explicit return, returns 30