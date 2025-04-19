;; Main entry point for testing language interoperability
;; This file demonstrates imports in all directions without circular dependencies

;; Import from both TypeScript and HQL
(import [hqlFunction testWithInput] from "./a.hql")
(import [transformWithTs formatInTs TS_VERSION] from "./b.ts")

;; Run the full test
(console.log "\n=== TESTING FULL LANGUAGE INTEROPERABILITY ===\n")
(console.log "TypeScript version:" TS_VERSION)

;; Test TypeScript -> HQL import
(console.log "\n--- Testing TypeScript importing from HQL ---")
(def tsResult (transformWithTs 5))
(console.log "TypeScript function returned:" tsResult)
;; Expected: transformWithTs calls hqlFunction(5) = 5+10 = 15, then doubles it to 30

;; Test HQL functionality 
(console.log "\n--- Testing HQL function ---")
(def hqlResult (testWithInput 10))
(console.log "HQL function returned:" hqlResult)
;; Expected: testWithInput adds 10, so result is 20

;; Test TypeScript formatting
(console.log "\n--- Testing TypeScript formatting ---")
(def formattedValue (formatInTs "Hello from HQL"))
(console.log "TypeScript formatter returned:" formattedValue)

;; Show successful completion
(console.log "\n=== LANGUAGE INTEROPERABILITY TEST COMPLETED SUCCESSFULLY ===\n") 