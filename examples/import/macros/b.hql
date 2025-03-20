;; examples/macros/b.hql
;; Example module importing user-level macros

;; Import specific macros and functions from module a.hql
(import [user-log, format-data, add] from "./a.hql")

;; Use the imported user-level macros
(user-log "Hello from module b.hql")

;; User macros work exactly like normal macros when imported
(let (name "John")
  (user-log "User name is" name))

;; Format macro produces expressions that return values
(def formatted (format-data "Some value" "Label"))
(console.log "Formatted output:" formatted)

;; Use the imported function
(console.log "Sum:" (add 5 10))

;; global-log macro is not directly accessible here
;; Uncommenting this would cause an error:
;; (global-log "This won't work")

;; Try importing with aliases
(import [user-log as custom-log, add as sum] from "./a.hql")

;; Use aliased imports
(custom-log "Using aliased version of user-log")
(console.log "Sum using alias:" (sum 10 20))