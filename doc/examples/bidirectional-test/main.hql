;; Main entry for testing bidirectional imports (main.hql)
;; This demonstrates HQL -> TS -> JS -> HQL chain

;; Import directly from JavaScript for complete chain
(import [jsProcess jsFormatJson JS_VERSION_INFO] from "./c.js")

;; Import from HQL that gets imported by TypeScript
(import [hqlAdd] from "./a.hql")

;; Main test function
(fn runBidirectionalTest ()
  (console.log "\n=== TESTING BIDIRECTIONAL IMPORTS ACROSS LANGUAGES ===\n")
  
  ;; Show version information from all languages
  (console.log "Version Information:")
  (console.log "  HQL Version:" JS_VERSION_INFO.hqlVersion)
  (console.log "  TypeScript Version:" JS_VERSION_INFO.tsVersion)
  (console.log "  JavaScript Version:" JS_VERSION_INFO.jsVersion)
  
  ;; Test the full import chain:
  ;; 1. HQL function imported by TypeScript
  ;; 2. TypeScript function uses HQL function and is imported by JavaScript
  ;; 3. JavaScript function uses TypeScript function and is imported back into HQL
  (console.log "\n--- Testing Full Import Chain ---")
  (var startValue 5)
  (console.log "Starting with value:" startValue)
  
  ;; Process through the full chain
  (var result (jsProcess startValue))
  
  ;; Display the result as JSON
  (console.log "\nFinal Result:")
  (console.log (jsFormatJson result))
  
  ;; Verify that the direct HQL import also works
  (console.log "\n--- Verifying Direct HQL Import ---")
  (var directResult (hqlAdd 10))
  (console.log "Direct HQL function result:" directResult)
  
  (console.log "\n=== BIDIRECTIONAL IMPORT TEST COMPLETED SUCCESSFULLY ===\n"))

;; Run the test
(runBidirectionalTest) 