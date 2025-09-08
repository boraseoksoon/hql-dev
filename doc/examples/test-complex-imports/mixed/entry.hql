;; Mixed file types test - Entry HQL file
;; HQL can import from both JS and TS files directly

;; Import from JS
(import [jsFunction] from "./helper.js")

;; Import from JS (was TS, but JS files can't import from TS)
(import [formatMessage processData] from "./utils.js")

;; Function that uses both imports
(fn mixedFunction ()
  (var jsResult (jsFunction 10))
  (var processed (processData [1 2 3 4 5]))
  (print (formatMessage "Mixed test"))
  (+ jsResult processed))

;; Export the function
(export [mixedFunction])

;; Test the function
(print "Mixed result:" (mixedFunction)) 