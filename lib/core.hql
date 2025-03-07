;; lib/core.hql - Core macros for HQL

;; Define defn: For now, support a single-expression body.
(defmacro defn (name params body)
  (list (quote def) name (list (quote fn) params body)))

;; Define import: expands (import "module") into (js-import "module")
(defmacro import (path)
  (list (quote js-import) path))

;; Define export: expands (export "name" value) into (js-export "name" value)
(defmacro export (name value)
  (list (quote js-export) name value))

;; when: Just an alias for if
;; This simply expands to the core if form
(defmacro when (test then-expr else-expr)
  (list (quote if) test then-expr else-expr))

  ;; or: Return first truthy expression or last expression
(defmacro or (a b)
  (list (quote if) a a b))

;; and: Return last expression if all are truthy, otherwise first falsy
(defmacro and (a b)
  (list (quote if) a b a))

;; not: Logical negation
(defmacro not (expr)
  (list (quote if) expr (quote 0) (quote 1)))

;; Flow control macros

;; cond: Multi-branch conditional, like a series of if/else-if/else
;; Usage: (cond (test1 result1) (test2 result2) (else default))
(defmacro cond (first-pair second-pair)
  (list (quote if) 
        (first first-pair)
        (second first-pair)
        (if (= (first second-pair) (quote else))
            (second second-pair)
            (list (quote cond) second-pair (quote (else 0))))))

;; do: Execute multiple expressions and return the last one
;; Usage: (do expr1 expr2 expr3)
(defmacro do (first-expr second-expr)
  (list (quote (fn [] first-expr second-expr))))