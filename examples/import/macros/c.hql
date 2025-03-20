;; examples/macros/c.hql
;; Demonstrates macro isolation

;; This module doesn't import anything from a.hql

;; Define our own user-log macro with different behavior
(macro user-log (& args)
  `(console.log "C MODULE LOG:" ~@args))

;; Use our local version
(user-log "This uses c.hql's version of user-log")

;; We can also define our own format-data with different behavior
(macro format-data (value label)
  `(+ "[" ~label "] " ~value))

;; Use our version
(def my-formatted (format-data "My value" "My label"))
(console.log my-formatted)

;; Export our macros
(export [user-log, format-data])