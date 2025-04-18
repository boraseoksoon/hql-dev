;; Simple test for importing from JS
;; This file just attempts to import from a JS module

;; Import from JS file
(import [jsFunction] from "./simple.js")

;; Test the import
(console.log "JS function result:" (jsFunction 10))

;; Export
(export [jsFunction]) 