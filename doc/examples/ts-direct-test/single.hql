;; Ultra-simplified Import Test
;; Only tests JavaScript import

;; Import from JavaScript
(import [jsFunction] from "./simple.js")

;; Main function
(fn testImport ()
  (console.log "Testing JS import...")
  (var result (jsFunction 10))
  (console.log "Result:" result)
  result)

;; Run test
(testImport)

;; Export
(export [testImport]) 