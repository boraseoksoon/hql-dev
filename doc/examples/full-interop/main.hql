;; Main Entry Point for Full Interop Test
;; Demonstrates circular dependencies between HQL, JS, and TypeScript

;; Import from TypeScript
(import [UserManager userManager APP_VERSION] from "./typescript/user-manager.ts")

;; Import from JavaScript
(import [createTestUser jsModuleInfo] from "./javascript/process.js")

;; Testing Circular Imports Between HQL, JS, and TypeScript
(defn runFullInteropTest []
  (console.log "\n=== FULL INTEROP TEST BETWEEN HQL, JAVASCRIPT, AND TYPESCRIPT ===\n")
  
  ;; Show version information
  (console.log "App Version (from TypeScript):" APP_VERSION)
  (console.log "JS Module Info:" (js-stringify jsModuleInfo))
  
  (console.log "\n--- Adding Users ---\n")
  
  ;; Use TypeScript UserManager to add users
  (def result1 (userManager.addUser 1 "Alice" "admin"))
  (def result2 (userManager.addUser 2 "Bob" "developer"))
  (def result3 (userManager.addUser 3 "Charlie" "guest"))
  
  ;; Create a user directly from JavaScript
  (console.log "\n--- Creating a user from JavaScript ---\n")
  (def jsUser (createTestUser))
  (console.log "User created from JS:" (js-stringify jsUser))
  
  ;; Process users with TypeScript
  (console.log "\n--- Processing Users with TypeScript ---\n")
  (def processResult (userManager.processUsers))
  
  ;; Display processed users
  (if processResult.success
      (do
        (console.log "Successfully processed users:")
        (def processedUsers processResult.data)
        ;; Define a callback function for forEach properly
        (defn processUser [user]
          (console.log "- User:" user.displayName 
                      "Permissions:" (js-stringify user.permissions)
                      "Source:" user.source))
        ;; Call forEach with the function
        (processedUsers.forEach processUser)
        
        ;; Get user statistics
        (def stats (userManager.getUserStats))
        (console.log "\nUser Statistics:")
        (console.log " - Total users:" stats.total)
        (console.log " - Active users:" stats.active)
        (console.log " - Roles:" (js-stringify stats.roles)))
      
      ;; Handle error
      (console.error "Error processing users:" processResult.error))
  
  (console.log "\n=== FULL INTEROP TEST COMPLETED SUCCESSFULLY ===\n"))

;; Run the test
(runFullInteropTest) 