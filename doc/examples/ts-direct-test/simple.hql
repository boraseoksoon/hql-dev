;; Simple HQL file importing from JavaScript
;; This avoids TypeScript imports which might be causing issues

;; Import from local JS file
(import [jsFunction] from "./simple.js")

;; Import from HTTP (path module is commonly used)
(import path from "https://deno.land/std@0.170.0/path/mod.ts")

;; Import from NPM
(import lodash from "npm:lodash")

;; Import from JSR
(import chalk from "jsr:@nothing628/chalk@1.0.0")

;; Main function
(fn testImports ()
  (console.log "=== Testing Imports ===")
  
  ;; Test JS import
  (console.log "JS function result:" (jsFunction 5))
  
  ;; Test HTTP import
  (console.log "Path join result:" (path.join "folder" "file.txt"))
  
  ;; Test NPM import
  (console.log "Lodash result:" (lodash.capitalize "hello world"))
  
  ;; Test JSR import
  (console.log "Chalk result:" (chalk.green "Success!"))
)

;; Run the test
(testImports)

;; Export
(export [testImports]) 