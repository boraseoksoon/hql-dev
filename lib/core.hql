;; lib/core.hql - Using original implementation without quasiquote

;; Define defn using original list construction
(defmacro defn (name params body)
  (list 'def name (list 'fn params body)))

(defmacro import (name path)
  (list 'js-import name path))

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
(defmacro cond (& clauses)
  (if (= (length clauses) 0)
      'nil
      (list 'if
            (first (first clauses))
            (second (first clauses))
            (if (> (length clauses) 1)
                (cons 'cond (rest clauses))
                'nil))))

;; nth: Access a collection element by index (Clojure-style)
;; Usage: (nth collection index) -> (get collection index)
(defmacro nth (coll idx)
  (list 'get coll idx))

;; when: Execute body only if test is truthy; otherwise, return nil.
(defmacro when (test & body)
  (list 'if test (cons 'do body) (list 'quote 'nil)))

;; unless: Execute body only if test is falsy; otherwise, return nil.
(defmacro unless (test & body)
  (list 'if test (list 'quote 'nil) (cons 'do body)))

(defmacro inc (x)
  (list '+ x '1))

(defmacro dec (x)
  (list '- x '1))

(defmacro let (bindings body)
  (if (< (length bindings) 2)
      body
      (list 
        (list 'fn 
          (list (first bindings)) 
          (if (> (length bindings) 2)
              (list 'let (rest (rest bindings)) body)
              body))
        (first (rest bindings)))))

(defmacro str (& args)
  (cons '+ args))

(defmacro if-let (binding then else)
  (list 'let binding (list 'if (first binding) then else)))

(defmacro print (& args)
  (cons 'console.log args))

(defmacro contains? (s x)
  (list 'js-call s 'has x))

(defmacro add-one (x)
  (list '+ x (list 'literal 1)))

(defmacro big-double (x)
  (list '* (list 'literal 2) (add-one x)))

