;; Entry point for circular import test between TypeScript and HQL
;; This file imports and uses both modules

;; Import functions from both files
(import [hqlFunction] from "./hql-module.hql")
(import [tsFunction TS_CONSTANT] from "./ts-module.ts")

;; Main function to test the circular imports
(defn main []
  (console.log "\n=== Testing TypeScript/HQL Circular Imports ===\n")
  
  ;; Test the HQL function directly
  (console.log "Calling HQL function directly:")
  (def hql-result (hqlFunction 5))
  (console.log "HQL function result:" hql-result)
  
  (console.log "\n---\n")
  
  ;; Test the TypeScript function (which uses the HQL function internally)
  (console.log "Calling TypeScript function (which calls HQL function):")
  (def ts-result (tsFunction 5))
  (console.log "TypeScript function result:" ts-result)
  
  ;; Verify the expected calculation:
  ;; hqlFunction(5) = 5 + 10 = 15
  ;; tsFunction(5) = hqlFunction(5) * 2 = 15 * 2 = 30
  (console.log "\n---\n")
  (console.log "Verification:" (= ts-result (* hql-result 2)))
  
  (console.log "\n=== Test Complete ==="))

;; Run the main function
(main) 