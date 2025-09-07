
;; Import directly from a JS module
(import jsModule from "./base.js")

;; Test function call
(console.log "Direct JS import test")
(let result (jsModule.baseHqlFunction 10))
(console.log "Result:" result) 
