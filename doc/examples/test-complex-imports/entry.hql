;; Main entry point that imports from various modules
;; Tests complex import scenarios

;; Import from circular dependency
(import [circularFunction] from "./circular/a.hql")

;; Import from mixed file types
(import [mixedFunction] from "./mixed/entry.hql")

;; Import from deeply nested modules
(import [nestedFunction] from "./nested/entry.hql")

;; Let's test all the imports
(console.log "=== Testing Complex Import Scenarios ===")
(console.log "Circular import result:" (circularFunction))
(console.log "Mixed file types result:" (mixedFunction))
(console.log "Nested import result:" (nestedFunction))

;; Call a function that comes from the deepest import
(import [deepFunction] from "./nested/a/deep-function.hql")
(console.log "Deep import result:" (deepFunction)) 