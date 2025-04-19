;; Simplified Interoperability Test
;; Demonstrates most essential import directions

;; Import from JavaScript
(import [jsLocalFunction] from "./javascript/simple.js")

;; Import from HQL
(import [hqlLocalFunction] from "./hql/local.hql")

;; Import from HTTP
(import path from "https://deno.land/std@0.170.0/path/mod.ts")

;; Main function
(fn testImports ()
  (console.log "=== IMPORT TEST RESULTS ===")
  
  ;; JS import
  (var jsResult (jsLocalFunction 5))
  (console.log "JS import result:" jsResult)
  
  ;; HQL import
  (var hqlResult (hqlLocalFunction 10))
  (console.log "HQL import result:" hqlResult)
  
  ;; HTTP import
  (var pathResult (path.join "folder" "file.txt"))
  (console.log "HTTP import result:" pathResult)
  
  ;; Return success
  (console.log "All imports successful!")
)

;; Run tests
(testImports)

;; Export for potential reuse
(export [testImports]) 