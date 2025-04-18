;; Simple test for importing from TypeScript
;; This file attempts to import from a TS module

;; Import from TS file
(import [tsFunction] from "./ts-module.ts")

;; Test the import
(console.log "TS function result:" (tsFunction 10))

;; Export
(export [tsFunction]) 