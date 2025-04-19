;; HQL User Service
;; Uses TypeScript type definitions and JavaScript functionality

;; Import from TypeScript module
(import [User ProcessedUser APP_VERSION default as typeUtils] from "../typescript/shared-types.ts")

;; Import from JavaScript module
(import [processData filterActive] from "../javascript/process.js")

;; Declare a user using TypeScript type
(defn createUser [id name role]
  (console.log "Creating user from HQL with TypeScript types")
  (console.log "Using APP_VERSION:" APP_VERSION)
  
  ;; Create an object matching User interface
  (def user (js-object))
  (set! user.id id)
  (set! user.name name)
  (set! user.role role)
  (set! user.isActive true)
  (set! user.createdAt (new Date))
  
  ;; Call function from TypeScript module
  (console.log "Default user from TS:" (js-stringify (typeUtils.createDefaultUser)))
  
  ;; Return the user
  user)

;; Process a user with JS function
(defn enrichUserData [user]
  (console.log "Processing user in HQL")
  
  ;; Call JavaScript function to process data
  (def processedUser (processData user))
  
  ;; Add HQL-specific data
  (set! processedUser.source "HQL")
  (set! processedUser.permissions (array "read" "write"))
  
  ;; Format displayName
  (set! processedUser.displayName 
    (+ processedUser.name 
       " (" processedUser.role ")"))
  
  processedUser)

;; Export functions for use in other modules
(export [createUser enrichUserData]) 