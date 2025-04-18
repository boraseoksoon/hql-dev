;; export-test.hql - Tests various export/import patterns

;; Import functions with aliases
(import [add_numbers as add, multiply_numbers as mul] from "./export-lib.hql")

;; Direct import of variable
(import [secret_number] from "./export-lib.hql")

;; Namespace import for other exports
(import exportLib from "./export-lib.hql")

(console.log "Export/Import Test")
(console.log "Direct imports:")
(console.log "  add(10, 20):" (add 10 20))
(console.log "  mul(5, 6):" (mul 5 6))
(console.log "  secret_number:" secret_number)

(console.log "Namespace imports:")
(console.log "  divide_numbers(100, 5):" (exportLib.divide_numbers 100 5))
(console.log "  app_name:" exportLib.app_name)
(console.log "  format_message:" (exportLib.format_message "Hello from export test!")) 