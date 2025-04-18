;; Nested HQL module
;; This module demonstrates a deeply nested import

;; Import from a JS module in a different path
(import [deepJsFunction] from "../js-nested/deep-js.js")

;; Define a function that uses the import
(fn nestedHqlFunction (x)
  (let ((deepResult (deepJsFunction x)))
    ;; Test collection access
    (let ((arr [1 2 3 4 5]))
      (+ deepResult (arr 2)))))

;; Export for parent
(export [nestedHqlFunction]) 