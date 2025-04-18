;; Simple test entry point

;; Import from module B
(import [bFunction] from "./b.hql")

;; Test the import
(console.log "Simple test result:" (bFunction)) 