;; Extreme nested import test - Entry point
;; This file tests the most complex import and interop scenarios

;; Import from HQL, JS and TS in a mixed pattern
(import [hqlFunction] from "./hql-module.hql")
(import [jsFunction] from "./js-module.js")
(import moduleTs from "./ts-module.ts")

;; Import from a circular reference
(import [circularFunction] from "./circular/a.hql")

;; Function that combines all imports - using individual variable bindings instead of a list of tuples
(fn extremeFunction ()
  (var hqlResult (hqlFunction 10))
  (var jsResult (jsFunction 20))
  (var tsResult (moduleTs.tsFunction 30))  
  (var circResult (circularFunction))
  (+ hqlResult jsResult tsResult circResult))

;; Test everything
(console.log "HQL result:" (hqlFunction 5))
(console.log "JS result:" (jsFunction 10))
(console.log "TS result:" (moduleTs.tsFunction 15))
(console.log "Circular result:" (circularFunction))
(console.log "Combined result:" (extremeFunction))

;; Export the function
(export [extremeFunction]) 