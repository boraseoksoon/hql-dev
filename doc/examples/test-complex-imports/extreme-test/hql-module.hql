;; HQL module with nested imports
;; This module imports from deeper modules

;; Import from nested modules
(import [nestedHqlFunction] from "./nested/nested-hql.hql")

;; Define a function that uses the nested import
(fn hqlFunction (x)
  (let ((nestedResult (nestedHqlFunction (* x 2))))
    (+ nestedResult 5)))

;; Export for parent
(export [hqlFunction]) 