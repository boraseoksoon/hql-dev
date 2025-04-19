;; Simple Interop Test
;; Imports from both TypeScript and JavaScript

;; Import from TypeScript
(import [APP_VERSION MAX_USERS SAMPLE_USER] from "./typescript/shared-types.ts")

;; Import from JavaScript
(import [formatMessage jsInfo] from "./javascript/simple-process.js")

;; Show TypeScript imports
(console.log "\n=== TYPESCRIPT IMPORT TEST ===\n")
(console.log "App Version from TypeScript:" APP_VERSION)
(console.log "Max Users Constant:" MAX_USERS)
(console.log "Sample User from TypeScript:")
(console.log "  - ID:" SAMPLE_USER.id)
(console.log "  - Name:" SAMPLE_USER.name)
(console.log "  - Role:" SAMPLE_USER.role)
(console.log "  - Active:" SAMPLE_USER.isActive)
(console.log "\n=== TYPESCRIPT IMPORT TEST COMPLETED ===\n")

;; Show JavaScript imports
(console.log "\n=== JAVASCRIPT IMPORT TEST ===\n")
(console.log "Message formatted by JS:" (formatMessage "hello from hql"))
(console.log "JS Module Info:")
(console.log "  - Name:" jsInfo.name)
(console.log "  - Version:" jsInfo.version)
(console.log "  - Features:" (JSON.stringify jsInfo.features))
(console.log "\n=== JAVASCRIPT IMPORT TEST COMPLETED ===\n")

;; Show successful interop
(console.log "\n=== FULL INTEROP TEST SUCCESSFUL ===\n") 