;; Absolutely minimal HQL file importing from TypeScript

;; Import from TypeScript directly
(import [formatString] from "./simple.ts")

;; Show a message
(console.log "\n=== TESTING HQL IMPORTING FROM TYPESCRIPT ===\n")

;; Use the imported TypeScript function directly in console.log
(console.log "Formatted by TypeScript:" (formatString "Hello from HQL"))

;; Show success message
(console.log "\n=== TEST COMPLETED SUCCESSFULLY ===\n") 