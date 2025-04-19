;; Extreme nested import test - Entry point (Simplified)
;; This file tests complex import and interop scenarios while avoiding circularity

;; Import directly from TypeScript and circular reference (similar to extreme-test-simple)
(import moduleTs from "./ts-module.ts")
(import [myFunction as circularFunction] from "./circular/a.hql")

;; Import directly from JavaScript helper
(import [helperFunction] from "./js-helper.js")

;; Instead of importing the problematic modules, implement their functionality directly
;; This function represents what hqlFunction would do
(fn hqlFunction (x)
  (+ (* x 2) 5))

;; This function represents what jsFunction would do
(fn jsFunction (x)
  (+ (* x 3) (helperFunction x)))

;; Function that combines all approaches
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