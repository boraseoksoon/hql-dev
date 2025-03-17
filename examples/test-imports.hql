;; test-imports.hql - Test file for all import types

;; Test JSR import
(import chalk "jsr:@nothing628/chalk@1.0.0")
(console.log (chalk.red "JSR import working!"))

;; Test HTTP import
(import path "https://deno.land/std@0.170.0/path/mod.ts")
(def joined-path (path.join "folder" "file.txt"))
(console.log "HTTP import working! Path:" joined-path)

;; Test NPM import
(import lodash "npm:lodash@4.17.21")
(console.log "NPM import working! Capitalized:" (lodash.capitalize "hello world"))

;; Test lodash-capitalize macro from the standard library
(console.log "Macro test:" (lodash-capitalize "using standard library"))