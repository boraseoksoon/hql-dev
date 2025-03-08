;; lib/core.hql - All verified macros combined

;; Define defn: For now, support a single-expression body.
(defmacro defn (name params body)
  (list (quote def) name (list (quote fn) params body)))

;; Define import: expands (import "module") into (js-import "module")
(defmacro import (path)
  (list (quote js-import) path))

;; Define export: expands (export "name" value) into (js-export "name" value)
(defmacro export (name value)
  (list (quote js-export) name value))

;; or: Return first truthy expression or last expression
(defmacro or (a b)
  (list (quote if) a a b))

;; and: Return last expression if all are truthy, otherwise first falsy
(defmacro and (a b)
  (list (quote if) a b a))

;; not: Logical negation
(defmacro not (expr)
  (list (quote if) expr (quote 0) (quote 1)))

;; do: Execute multiple expressions and return the last one
;; Expands to an immediately-invoked function expression
(defmacro do (& forms)
  (list (cons (quote fn)
              (cons (list) forms))
        (list)))

;; cond: Simple conditional with two branches
;; Usage: (cond (test1 result1) (test2 result2))
(defmacro cond (test-result1 test-result2)
  (list (quote if) 
        (first test-result1) 
        (second test-result1)
        (second test-result2)))

;; Define a macro for dot notation JS interop
(defmacro dot-access (expr)
  (let* ((symbol-str (symbol->string expr))
         (dot-index (string-index-of symbol-str "."))
         (obj (string-slice symbol-str 0 dot-index))
         (prop (string-slice symbol-str (+ dot-index 1))))
    (list (quote js-get-invoke) obj prop)))