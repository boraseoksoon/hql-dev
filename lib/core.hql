;; lib/core.hql - Using original implementation without quasiquote

;; Define defn using original list construction
(defmacro defn (name params body)
  (list 'def name (list 'fn params body)))

;; Rest use quote reader macro for now
;; Define import: expands (import "module") into (js-import "module")
(defmacro import (path)
  (list 'js-import path))

;; Define export: expands (export "name" value) into (js-export "name" value)
(defmacro export (name value)
  (list 'js-export name value))

;; or: Return first truthy expression or last expression
(defmacro or (a b)
  (list 'if a a b))

;; and: Return last expression if all are truthy, otherwise first falsy
(defmacro and (a b)
  (list 'if a b a))

;; not: Logical negation
(defmacro not (expr)
  (list 'if expr '0 '1))

;; do: Execute multiple expressions and return the last one
;; Expands to an immediately-invoked function expression
(defmacro do (& forms)
  (list (cons 'fn
              (cons (list) forms))
        (list)))

;; cond: Simple conditional with two branches
;; Usage: (cond (test1 result1) (test2 result2))
(defmacro cond (test-result1 test-result2)
  (list 'if 
        (first test-result1) 
        (second test-result1)
        (second test-result2)))