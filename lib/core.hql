;; core.hql - Core HQL library implemented in HQL itself
;; This file defines macros that extend the minimal core

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Core Macros
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Define a function
(defmacro defn [name params & body]
  (list 'def name (list 'fn params body)))

;; Let bindings
(defmacro let [bindings & body]
  (let [vars (map (fn [i] (nth bindings (* i 2))) 
                 (range 0 (/ (count bindings) 2)))
        vals (map (fn [i] (nth bindings (+ (* i 2) 1))) 
                 (range 0 (/ (count bindings) 2)))]
    (list (list 'fn vars body) vals)))

;; When conditional (if with no else)
(defmacro when [test & body]
  (list 'if test (cons 'do body) null))

;; Unless conditional (when-not)
(defmacro unless [test & body]
  (list 'if test null (cons 'do body)))

;; Do - sequence of expressions
(defmacro do [& body]
  (if (empty? body)
    (list 'quote nil)
    (list 'let [] body)))

;; Extended function definition (fx)
(defmacro fx [name params & body]
  (let [clean-params (map (fn [p]
                         (if (list? p)
                           (first p)  ; Extract name from type annotation
                           p))
                       params)]
    (list 'defn name clean-params body)))

;; Import as a macro that expands to js-import primitive
(defmacro import [path]
  (list 'js-import (list 'quote path)))

;; Export as a macro that expands to js-export primitive
(defmacro export [name value]
  (list 'js-export (list 'quote name) value))

;; JS interop for property access and auto-invocation
(defmacro js-get-invoke [obj prop]
  (list 'js-interop-iife obj prop))

;; new as a macro that expands to js-new primitive
(defmacro new [constructor & args]
  (list 'js-new constructor args))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Core functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Map a function over a collection
(defn map [f coll]
  (if (empty? coll)
    (list)
    (cons (f (first coll)) (map f (rest coll)))))

;; Filter a collection
(defn filter [pred coll]
  (if (empty? coll)
    (list)
    (let [x (first coll)
          xs (rest coll)]
      (if (pred x)
        (cons x (filter pred xs))
        (filter pred xs)))))

;; Reduce a collection
(defn reduce [f init coll]
  (if (empty? coll)
    init
    (reduce f (f init (first coll)) (rest coll))))

;; Get nth element of a collection
(defn nth [coll index]
  (if (< index 0)
    (throw "Index out of bounds")
    (if (= index 0)
      (first coll)
      (nth (rest coll) (- index 1)))))

;; Range of numbers
(defn range [start end]
  (if (>= start end)
    (list)
    (cons start (range (+ start 1) end))))

;; List type check
(defn list? [x]
  (= (type x) "list"))

;; Number type check  
(defn number? [x]
  (= (type x) "number"))

;; String type check
(defn string? [x]
  (= (type x) "string"))