;; Circular dependency test file B
;; This is imported by A and also imports from A

;; Import from A creating a circular dependency
(import [baseValue] from "./a.hql")

;; Function that uses the imported value from A
(fn incrementCircular (value)
  (+ value baseValue))

;; Test function to demonstrate accessing the imported value
(fn testAccess ()
  (console.log "Base value from a.hql:" baseValue)
  baseValue)

;; Export the function for A to use
(export [incrementCircular])
