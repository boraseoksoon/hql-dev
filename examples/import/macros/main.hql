;; examples/macros/main.hql
;; Main test file showing how user macros behave

;; Import from both modules with explicit aliases
(import [user-log as a-log, format-data as a-format] from "./a.hql")
(import [user-log as c-log, format-data as c-format] from "./c.hql")

;; We can use both macros side by side with their respective aliases
(a-log "This uses a.hql's implementation")
(c-log "This uses c.hql's implementation")

;; Both format implementations can be used together
(def a-result (a-format "Value A" "Label A"))
(def c-result (c-format "Value C" "Label C"))

(console.log "a-format result:" a-result)
(console.log "c-format result:" c-result)

;; global-log is a system-wide macro and should be available everywhere
(global-log "This uses the globally available macro from a.hql")

;; Demonstrate how user macros expand differently
(console.log "
Expansion differences:
1. a-format expands to: (let (result (+ 'Label A' ': ' 'Value A')) result)
2. c-format expands to: (+ '[' 'Label C' '] ' 'Value C')
")