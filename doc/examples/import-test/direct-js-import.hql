;; direct-js-import.hql - Direct import from JS
;; Import directly from a JS module
(import jsModule from "./base.js")

;; Test function call
(console.log "Direct JS import test")
(let result (jsModule.baseJsFunction 10))
(console.log "Result:" result) 