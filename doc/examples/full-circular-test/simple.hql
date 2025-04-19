;; Simple HQL file importing from TypeScript

;; Import from TypeScript
(import [formatString uppercaseString] from "./simple.ts")

;; Use the TypeScript functions
(console.log "\n=== TESTING HQL IMPORTING FROM TYPESCRIPT ===\n")

;; Test the formatString function from TypeScript
(var formatted (formatString "Hello from HQL"))
(console.log "Formatted by TypeScript:" formatted)

;; Test the uppercaseString function from TypeScript
(var uppercase (uppercaseString "typescript integration works!"))
(console.log "Uppercase by TypeScript:" uppercase)

(console.log "\n=== TEST COMPLETED SUCCESSFULLY ===\n") 