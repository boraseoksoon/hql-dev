;; core.hql - Absolute minimum core library
;; Only includes the essential macros needed to get started

;; Define a function - the most essential macro
;; Expands (defn name params body) to (def name (fn params body))
(defmacro defn [name params body]
  (list 'def name (list 'fn params body)))

;; Import as a macro that expands to js-import primitive
(defmacro import [path]
  (list 'js-import (list 'quote path)))

;; Export as a macro that expands to js-export primitive
(defmacro export [name value]
  (list 'js-export (list 'quote name) value))