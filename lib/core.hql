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