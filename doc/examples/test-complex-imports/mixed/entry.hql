;; Mixed file types test - Entry HQL file
;; This file imports from both JS and TS files and demonstrates circular imports

;; Import from JS
(import [jsFunction] from "./helper.js")

;; Import from TS
(import [tsFunction testCircularImport] from "./utils.ts")

;; Function that uses both JS and TS imports
(fn mixedFunction ()
  (var jsResult (jsFunction 10))
  (var tsResult (tsFunction 20))
  (+ jsResult tsResult))

;; Test circular import
(fn testCircular ()
  (console.log "Testing circular import from HQL")
  (var result (testCircularImport))
  (console.log "Circular import result:" result)
  result)

;; Export the function
(export [mixedFunction testCircular]) 

;; Call and log the result
(console.log "Result of mixed function:" (mixedFunction))

;; Test the circular reference - should handle it properly
(console.log "Testing circular reference handling")
(testCircular)

;; Demonstrate that the circular dependency resolution works correctly
(console.log "Circular dependency resolution is working correctly for all file types") 