;; Simplified extreme import test - Entry point
;; This file tests TS/HQL interop without circular dependencies

;; Import from TS directly
(import moduleTs from "./ts-module.ts")

;; Import from a circular reference
(import [circularFunction] from "./circular/a.hql")

;; Function that combines all imports
(fn extremeFunction ()
  (var tsResult (moduleTs.tsFunction 30))
  (var circResult (circularFunction))
  (+ tsResult circResult))

;; Test everything
(console.log "TS module result:" (moduleTs.tsFunction 15))
(console.log "Circular result:" (circularFunction))
(console.log "Combined result:" (extremeFunction))

;; Export the function
(export [extremeFunction]) 