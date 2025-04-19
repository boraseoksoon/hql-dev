;; Secondary HQL module that imports from JavaScript (d.hql)
;; This completes the circular dependency chain

;; Import from JavaScript
(import [jsProcess JS_VERSION_INFO] from "./c.js")

;; Function that uses JavaScript functionality
(fn processValue (value)
  (console.log "HQL processValue function called with:" value)
  
  ;; Call JavaScript function (which uses TypeScript which uses HQL)
  (var jsResult (jsProcess value))
  
  ;; Return enhanced result
  (+ jsResult.result 100))

;; Export for circular imports
(export "processValue" processValue)
(export "HQL_MODULE_D" "This is module D in HQL") 