;; HQL module that interacts with TypeScript
;; This demonstrates circular dependency support between TS and HQL

;; Import from TypeScript
;; This creates a circular dependency
(import [TS_CONSTANT default as tsModuleDefault] from "./ts-module.ts")

;; Define a function that will be exported to TypeScript
(defn hqlFunction [x]
  (console.log "HQL function called with:" x)
  (console.log "TS_CONSTANT value:" TS_CONSTANT)
  (console.log "TS module default version:" tsModuleDefault.version)
  ;; Return a value that's been modified
  (+ x 10))

;; Export the function for use in TS
(export [hqlFunction]) 