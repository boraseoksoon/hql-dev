;; Mixed file types test - Entry HQL file
;; This file imports from both JS and TS files

;; Import from JS
(import [jsFunction] from "./helper.js")

;; Import from TS
(import [tsFunction] from "./utils.ts")

;; Function that uses both JS and TS imports
(fn mixedFunction ()
  (var jsResult (jsFunction 10))
  (var tsResult (tsFunction 20))
  (+ jsResult tsResult))

;; Export the function
(export [mixedFunction]) 